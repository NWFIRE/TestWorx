import type { InspectionType, SignatureKind, UserRole } from "@prisma/client";
import { z } from "zod";
import type { ReportStatus } from "@testworx/types";

import {
  resolveReportTemplate,
  type ReportAssetFilterDefinition,
  type ReportAssetRecord,
  type ReportFieldDefinition,
  type ReportPrimitiveValue,
  type ReportTemplateDefinition
} from "./report-config";
import { normalizeTwoDigitYear, runCalculation } from "./report-calculations";

const MAX_OVERALL_NOTES_LENGTH = 5000;
const MAX_SECTION_NOTES_LENGTH = 2000;
const MAX_DEFICIENCY_TITLE_LENGTH = 180;
const MAX_DEFICIENCY_DESCRIPTION_LENGTH = 3000;
const MAX_ATTACHMENT_COUNT = 16;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;
const MAX_DEFICIENCY_NOTES_LENGTH = 2000;
const INTERNAL_REPEATER_ROW_ID = "__rowId";
const DEFICIENCY_RESULT_VALUES = new Set(["fail", "deficiency", "needs_repair"]);

function isDataUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed.startsWith("data:")) {
    return false;
  }

  const commaIndex = trimmed.indexOf(",");
  if (commaIndex <= "data:".length) {
    return false;
  }

  const metadata = trimmed.slice("data:".length, commaIndex);
  if (!metadata.includes(";base64")) {
    return false;
  }

  const mimeType = metadata.slice(0, metadata.indexOf(";"));
  if (!mimeType || mimeType.includes(",")) {
    return false;
  }

  const encoded = trimmed.slice(commaIndex + 1);
  if (encoded.length === 0) {
    return false;
  }

  for (let index = 0; index < encoded.length; index += 1) {
    const char = encoded[index];
    if (
      char !== undefined &&
      !(
        (char >= "A" && char <= "Z") ||
        (char >= "a" && char <= "z") ||
        (char >= "0" && char <= "9") ||
        char === "+" ||
        char === "/" ||
        char === "=" ||
        char === "\n" ||
        char === "\r" ||
        char === "\t" ||
        char === " "
      )
    ) {
      return false;
    }
  }

  return true;
}

function estimateDataUrlBytes(value: string) {
  const [, encoded = ""] = value.split(",", 2);
  const normalized = encoded.replace(/\s+/g, "");
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

function isStoredImageReference(value: string) {
  return (value.startsWith("data:image/") && isDataUrl(value)) || value.startsWith("blob:");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asPrimitiveValue(value: unknown): ReportPrimitiveValue | undefined {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }

  return undefined;
}

function isEmptyValue(value: unknown) {
  return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
}

function optionValueExists(field: Exclude<ReportFieldDefinition, { type: "repeater" }>, value: ReportPrimitiveValue) {
  if (typeof value !== "string" || value === "") {
    return false;
  }

  return field.options?.some((option) => option.value === value) ?? false;
}

function applyCustomValueSupport<T extends Record<string, unknown>>(
  fieldDefinitions: Array<Exclude<ReportFieldDefinition, { type: "repeater" }>>,
  values: T
): T {
  const nextValues: Record<string, unknown> = { ...values };

  for (const field of fieldDefinitions) {
    if (field.type !== "select" || !field.customValueFieldId) {
      continue;
    }

    const customTrigger = field.customValueTrigger ?? "other";
    const currentValue = asPrimitiveValue(nextValues[field.id]);
    const currentCustomValue = asPrimitiveValue(nextValues[field.customValueFieldId]);

    if (!isEmptyValue(currentCustomValue) && isEmptyValue(currentValue)) {
      nextValues[field.id] = customTrigger;
      continue;
    }

    if (typeof currentValue === "string" && currentValue !== "" && currentValue !== customTrigger && !optionValueExists(field, currentValue)) {
      nextValues[field.customValueFieldId] = isEmptyValue(currentCustomValue) ? currentValue : currentCustomValue;
      nextValues[field.id] = customTrigger;
    }
  }

  return nextValues as T;
}

export function isFieldVisible(field: ReportFieldDefinition, values: Record<string, unknown>) {
  if (field.hidden) {
    return false;
  }

  if (!field.visibleWhen) {
    return true;
  }

  const candidate = asPrimitiveValue(values[field.visibleWhen.fieldId]);
  return field.visibleWhen.values.includes(candidate ?? null);
}

function defaultPrimitiveFieldValue(type: "boolean" | "text" | "number" | "date" | "select" | "photo") {
  return type === "boolean" ? false : "";
}

function defaultFieldValue(field: ReportFieldDefinition): ReportPrimitiveValue | Array<Record<string, ReportPrimitiveValue>> {
  if (field.type === "repeater") {
    return [];
  }

  return defaultPrimitiveFieldValue(field.type);
}

const reportScalarFieldValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const reportRepeaterRowSchema = z.record(reportScalarFieldValueSchema);
const reportFieldValueSchema = z.union([reportScalarFieldValueSchema, z.array(reportRepeaterRowSchema)]);

export const reportSectionStateSchema = z.object({
  status: z.enum(["pass", "attention", "fail", "pending"]).default("pending"),
  notes: z.string().max(MAX_SECTION_NOTES_LENGTH).default(""),
  fields: z.record(reportFieldValueSchema).default({})
});

export const reportDeficiencySchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(MAX_DEFICIENCY_TITLE_LENGTH),
  description: z.string().trim().min(1).max(MAX_DEFICIENCY_DESCRIPTION_LENGTH),
  severity: z.string().trim().min(1),
  status: z.string().trim().min(1),
  assetId: z.string().nullable().optional(),
  assetTag: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  deviceType: z.string().nullable().optional(),
  section: z.string().nullable().optional(),
  source: z.string().trim().min(1).default("manual"),
  sourceRowKey: z.string().trim().min(1).optional(),
  notes: z.string().max(MAX_DEFICIENCY_NOTES_LENGTH).optional().nullable(),
  photoStorageKey: z.string().default("").refine((value) => value === "" || isStoredImageReference(value), "Deficiency photos must be image references.").optional()
});

export const reportAttachmentSchema = z.object({
  id: z.string().min(1),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).refine((value) => value.startsWith("image/"), "Only image attachments are supported in reports."),
  storageKey: z.string().min(1).refine((value) => isStoredImageReference(value), "Attachments must be stored as image references.").refine((value) => !value.startsWith("data:") || estimateDataUrlBytes(value) <= MAX_ATTACHMENT_BYTES, "Each attachment must be 8 MB or smaller.")
});

export const reportSignatureSchema = z.object({
  signerName: z.string().trim().max(120).default(""),
  imageDataUrl: z.string().default("").refine((value) => value === "" || isStoredImageReference(value), "Signatures must be image references.").refine((value) => value === "" || !value.startsWith("data:") || estimateDataUrlBytes(value) <= MAX_SIGNATURE_BYTES, "Signature images must be 2 MB or smaller."),
  signedAt: z.string().default("")
});

export const reportDraftSchema = z.object({
  templateVersion: z.number().default(1),
  inspectionType: z.string().min(1),
  overallNotes: z.string().max(MAX_OVERALL_NOTES_LENGTH).default(""),
  sectionOrder: z.array(z.string()).default([]),
  activeSectionId: z.string().nullable().default(null),
  sections: z.record(reportSectionStateSchema).default({}),
  deficiencies: z.array(reportDeficiencySchema).max(MAX_ATTACHMENT_COUNT).default([]),
  attachments: z.array(reportAttachmentSchema).max(MAX_ATTACHMENT_COUNT).default([]),
  signatures: z.object({
    technician: reportSignatureSchema.optional(),
    customer: reportSignatureSchema.optional()
  }).default({}),
  context: z.object({
    siteName: z.string().max(160).default(""),
    customerName: z.string().max(160).default(""),
    scheduledDate: z.string().default(""),
    assetCount: z.number().default(0),
    priorReportSummary: z.string().max(1000).default("")
  }).default({ siteName: "", customerName: "", scheduledDate: "", assetCount: 0, priorReportSummary: "" })
});

export type ReportDraft = z.infer<typeof reportDraftSchema>;

export type ReportSectionCompletionState = "complete" | "partial" | "not_started";
export type ReportDetectedDeficiency = {
  sectionId: string;
  sectionLabel: string;
  repeaterFieldId: string;
  repeaterLabel: string;
  rowIndex: number;
  rowKey: string;
  rowLabel: string;
  fieldId: string;
  matchedFieldIds: string[];
  assetId: string | null;
  assetTag: string | null;
  location: string | null;
  deviceType: string | null;
  description: string;
  severity: string;
  notes: string;
  photoStorageKey: string | null;
};

export type ReportPreview = {
  sectionSummaries: Array<{
    sectionId: string;
    sectionLabel: string;
    status: ReportDraft["sections"][string]["status"];
    notes: string;
    completionState: ReportSectionCompletionState;
    completedRows: number;
    totalRows: number;
    deficiencyCount: number;
  }>;
  deficiencyCount: number;
  manualDeficiencyCount: number;
  attachmentCount: number;
  failingSections: string[];
  inspectionStatus: "pass" | "deficiencies_found";
  reportCompletion: number;
  completedRows: number;
  totalRows: number;
  detectedDeficiencies: ReportDetectedDeficiency[];
};

type DraftSectionState = ReportDraft["sections"][string];
type ReportRepeaterRow = Record<string, ReportPrimitiveValue>;
type SmartBuildContext = {
  inspectionType: InspectionType;
  siteDefaults: Record<string, ReportPrimitiveValue>;
  assets: ReportAssetRecord[];
  priorDraft: z.infer<typeof carryForwardDraftSchema> | null;
};

const carryForwardDraftSchema = z.object({
  overallNotes: z.string().max(MAX_OVERALL_NOTES_LENGTH).optional(),
  sectionOrder: z.array(z.string()).optional(),
  activeSectionId: z.string().nullable().optional(),
  sections: z.record(reportSectionStateSchema).optional(),
  deficiencies: z.array(reportDeficiencySchema).optional(),
  attachments: z.array(reportAttachmentSchema).optional(),
  signatures: z.object({
    technician: reportSignatureSchema.optional(),
    customer: reportSignatureSchema.optional()
  }).optional()
});

function parseOptionalDraft(input: unknown) {
  const parsed = input ? carryForwardDraftSchema.safeParse(input) : null;
  return parsed?.success ? parsed.data : null;
}

function normalizePrimitiveField(field: Exclude<ReportFieldDefinition, { type: "repeater" }>, value: unknown): ReportPrimitiveValue {
  let primitive = asPrimitiveValue(value);
  if (primitive === undefined) {
    return defaultPrimitiveFieldValue(field.type);
  }

  if (field.normalizeEmptyToDefault && isEmptyValue(primitive)) {
    const configuredDefault = field.prefill?.find((prefill) => prefill.source === "reportDefault")?.value;
    if (!isEmptyValue(configuredDefault)) {
      return configuredDefault as ReportPrimitiveValue;
    }
  }

  if (field.normalizeAs === "twoDigitYear") {
    return normalizeTwoDigitYear(primitive);
  }

  if (field.type === "select" && typeof primitive === "string" && field.legacyValueMap?.[primitive]) {
    primitive = field.legacyValueMap[primitive] ?? primitive;
  }

  return primitive;
}

function createRepeaterRowId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `row_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeRepeaterRowId(row: Record<string, unknown>) {
  return typeof row[INTERNAL_REPEATER_ROW_ID] === "string" && row[INTERNAL_REPEATER_ROW_ID]
    ? String(row[INTERNAL_REPEATER_ROW_ID])
    : createRepeaterRowId();
}

function normalizeRepeaterRows(field: Extract<ReportFieldDefinition, { type: "repeater" }>, value: unknown) {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .filter((row) => isRecord(row))
    .map((row) => {
      const normalizedRow: ReportRepeaterRow = {};
      for (const rowField of field.rowFields) {
        normalizedRow[rowField.id] = normalizePrimitiveField(rowField, row[rowField.id]);
      }
      normalizedRow[INTERNAL_REPEATER_ROW_ID] = normalizeRepeaterRowId(row);
      return applyRepeaterRowEnhancements(
        field.rowFields,
        applyFieldMappings(field.rowFields, normalizedRow, field.rowFields.map((rowField) => rowField.id))
      );
    });
}

function normalizeFieldValue(field: ReportFieldDefinition, value: unknown) {
  return field.type === "repeater" ? normalizeRepeaterRows(field, value) : normalizePrimitiveField(field, value);
}

function getPriorRowForAsset(priorDraft: z.infer<typeof carryForwardDraftSchema> | null, sectionId: string, repeaterFieldId: string, rowIdentityField: string | undefined, asset: ReportAssetRecord | null) {
  if (!priorDraft || !asset) {
    return null;
  }

  const priorRepeater = priorDraft.sections?.[sectionId]?.fields?.[repeaterFieldId];
  if (!Array.isArray(priorRepeater)) {
    return null;
  }

  const identityField = rowIdentityField ?? "assetId";
  return priorRepeater.find((row) => isRecord(row) && (row[identityField] === asset.id || row.assetTag === asset.assetTag)) as ReportRepeaterRow | undefined ?? null;
}

function assetMatchesFilter(asset: ReportAssetRecord, filter: ReportAssetFilterDefinition) {
  const metadata = asset.metadata && isRecord(asset.metadata) ? asset.metadata : {};
  const candidate = metadata[filter.key];

  if (filter.equals !== undefined) {
    return candidate === filter.equals;
  }

  if (filter.oneOf) {
    return filter.oneOf.includes(asPrimitiveValue(candidate) ?? null);
  }

  return true;
}

function filterAssetsForField(assets: ReportAssetRecord[], filters?: ReportAssetFilterDefinition[]) {
  if (!filters || filters.length === 0) {
    return assets;
  }

  return assets.filter((asset) => filters.every((filter) => assetMatchesFilter(asset, filter)));
}

function resolvePrefillValue(
  field: Exclude<ReportFieldDefinition, { type: "repeater" }>,
  input: {
    context: SmartBuildContext;
    sectionId: string;
    asset?: ReportAssetRecord | null;
    priorRow?: ReportRepeaterRow | null;
  }
): ReportPrimitiveValue | undefined {
  for (const provider of field.prefill ?? []) {
    if (provider.source === "asset" && input.asset) {
      const candidate = provider.key === "id" ? input.asset.id : provider.key === "name" ? input.asset.name : input.asset.assetTag;
      if (!isEmptyValue(candidate)) {
        return candidate ?? null;
      }
    }

    if (provider.source === "assetMetadata" && input.asset?.metadata && isRecord(input.asset.metadata)) {
      const candidate = asPrimitiveValue(input.asset.metadata[provider.key]);
      if (!isEmptyValue(candidate)) {
        return candidate;
      }
    }

    if (provider.source === "priorField") {
      if (input.priorRow) {
        const candidate = asPrimitiveValue(input.priorRow[provider.fieldId]);
        if (!isEmptyValue(candidate)) {
          return candidate;
        }
      }

      const section = input.context.priorDraft?.sections?.[provider.sectionId];
      const candidate = section ? asPrimitiveValue(section.fields[provider.fieldId]) : undefined;
      if (!isEmptyValue(candidate)) {
        return candidate;
      }
    }

    if (provider.source === "priorFirstField") {
      const section = input.context.priorDraft?.sections?.[provider.sectionId];
      for (const fieldId of provider.fieldIds) {
        if (input.priorRow) {
          const rowValue = asPrimitiveValue(input.priorRow[fieldId]);
          if (!isEmptyValue(rowValue)) {
            return rowValue;
          }
        }

        const candidate = section ? asPrimitiveValue(section.fields[fieldId]) : undefined;
        if (!isEmptyValue(candidate)) {
          return candidate;
        }
      }
    }

    if (provider.source === "priorAnyField") {
      const section = input.context.priorDraft?.sections?.[provider.sectionId];
      const foundValue = provider.fieldIds.some((fieldId) => {
        if (input.priorRow) {
          const rowValue = asPrimitiveValue(input.priorRow[fieldId]);
          if (!isEmptyValue(rowValue)) {
            return true;
          }
        }

        const candidate = section ? asPrimitiveValue(section.fields[fieldId]) : undefined;
        return !isEmptyValue(candidate);
      });

      if (foundValue) {
        return provider.value;
      }
    }

    if (provider.source === "priorFieldsJoined") {
      const section = input.context.priorDraft?.sections?.[provider.sectionId];
      const values = provider.fieldIds
        .map((fieldId) => {
          if (input.priorRow) {
            const rowValue = asPrimitiveValue(input.priorRow[fieldId]);
            if (!isEmptyValue(rowValue)) {
              return rowValue;
            }
          }

          return section ? asPrimitiveValue(section.fields[fieldId]) : undefined;
        })
        .filter((candidate) => !isEmptyValue(candidate));

      if (values.length > 0) {
        return values.map(String).join(provider.separator ?? " ");
      }
    }

    if (provider.source === "siteDefault") {
      const candidate = input.context.siteDefaults[provider.key];
      if (!isEmptyValue(candidate)) {
        return candidate;
      }
    }

    if (provider.source === "reportDefault" && !isEmptyValue(provider.value)) {
      return provider.value;
    }
  }

  return undefined;
}

function createRepeaterSeedRows(field: Extract<ReportFieldDefinition, { type: "repeater" }>, sectionId: string, context: SmartBuildContext) {
  const assets = field.repeatableSource === "siteAssets" ? filterAssetsForField(context.assets, field.assetFilter) : [];
  if (assets.length === 0) {
    return [];
  }

  return assets.map((asset) => {
    const priorRow = getPriorRowForAsset(context.priorDraft, sectionId, field.id, field.rowIdentityField, asset);
    const row: ReportRepeaterRow = {};
    for (const rowField of field.rowFields) {
      const value = resolvePrefillValue(rowField, { context, sectionId, asset, priorRow }) ?? defaultPrimitiveFieldValue(rowField.type);
      row[rowField.id] = value;
    }

    const withIdentity = isEmptyValue(row.assetId) ? { ...row, assetId: asset.id } : row;
    return applyRepeaterRowEnhancements(
      field.rowFields,
      applyFieldMappings(field.rowFields, withIdentity, field.rowFields.map((rowField) => rowField.id))
    );
  });
}

function buildSectionFields(section: ReportTemplateDefinition["sections"][number], currentSection: DraftSectionState | undefined, context: SmartBuildContext) {
  const fields: DraftSectionState["fields"] = {};

  for (const field of section.fields) {
    const currentValue = currentSection?.fields?.[field.id];
    if (field.type === "repeater") {
      const existingRows = normalizeRepeaterRows(field, currentValue);
      fields[field.id] = existingRows.length > 0 ? existingRows : createRepeaterSeedRows(field, section.id, context);
      continue;
    }

    if (!isEmptyValue(currentValue)) {
      fields[field.id] = normalizePrimitiveField(field, currentValue);
      continue;
    }

    const prefillValue = resolvePrefillValue(field, { context, sectionId: section.id }) ?? defaultPrimitiveFieldValue(field.type);
    fields[field.id] = normalizePrimitiveField(field, prefillValue);
  }

  return applyCustomValueSupport(
    section.fields.filter((field): field is Exclude<ReportFieldDefinition, { type: "repeater" }> => field.type !== "repeater"),
    fields
  );
}

function applyCalculatedFields(
  fieldDefinitions: ReportFieldDefinition[],
  fields: DraftSectionState["fields"],
  sections: Record<string, DraftSectionState>,
  currentSectionId: string
): DraftSectionState["fields"] {
  const nextFields = { ...fields };

  for (const field of fieldDefinitions) {
    const calculation = field.calculation;
    if (!calculation || field.type === "repeater") {
      continue;
    }

    const sourceSectionId = "sourceSectionId" in calculation && calculation.sourceSectionId
      ? calculation.sourceSectionId
      : currentSectionId;
    const sourceSection = sourceSectionId === currentSectionId
      ? { ...sections[sourceSectionId], fields: nextFields }
      : sections[sourceSectionId];
    const sourceField = "sourceFieldId" in calculation ? sourceSection?.fields?.[calculation.sourceFieldId] : undefined;
    const sourceRows = Array.isArray(sourceField) ? sourceField as ReportRepeaterRow[] : undefined;
    const sourceValue = !Array.isArray(sourceField) ? sourceField as ReportPrimitiveValue | undefined : undefined;
    const sourceValues = "sourceFieldIds" in calculation
      ? calculation.sourceFieldIds.map((fieldId) => (sourceSection?.fields?.[fieldId] as ReportPrimitiveValue | undefined) ?? null)
      : "sourceFields" in calculation
        ? calculation.sourceFields.map((source) => (sections[source.sectionId ?? currentSectionId]?.fields?.[source.fieldId] as ReportPrimitiveValue | undefined) ?? null)
        : undefined;
    nextFields[field.id] = runCalculation(calculation.key, {
      sourceValue,
      sourceRows,
      sourceValues,
      rowFieldId: "rowFieldId" in calculation ? calculation.rowFieldId : undefined,
      rowFieldIds: "rowFieldIds" in calculation ? calculation.rowFieldIds : undefined,
      equals: "equals" in calculation ? calculation.equals : undefined,
      emptyValue: "emptyValue" in calculation ? calculation.emptyValue : undefined,
      values: "values" in calculation ? calculation.values : undefined,
      passAtOrAbove: "passAtOrAbove" in calculation ? calculation.passAtOrAbove : undefined,
      attentionAtOrAbove: "attentionAtOrAbove" in calculation ? calculation.attentionAtOrAbove : undefined,
      atOrAbove: "atOrAbove" in calculation ? calculation.atOrAbove : undefined
    });
  }

  return nextFields;
}

function applyRepeaterRowCalculations(
  fieldDefinitions: Array<Exclude<ReportFieldDefinition, { type: "repeater" }>>,
  row: ReportRepeaterRow
) {
  const nextRow = { ...row };

  for (const field of fieldDefinitions) {
    const calculation = field.calculation;
    if (!calculation) {
      continue;
    }

    const sourceValue = "sourceFieldId" in calculation
      ? nextRow[calculation.sourceFieldId]
      : undefined;
    const sourceValues = "sourceFieldIds" in calculation
      ? calculation.sourceFieldIds.map((fieldId) => nextRow[fieldId] ?? null)
      : "sourceFields" in calculation
        ? calculation.sourceFields.map((source) => nextRow[source.fieldId] ?? null)
        : undefined;

    nextRow[field.id] = runCalculation(calculation.key, {
      sourceValue,
      sourceValues,
      rowFieldId: "rowFieldId" in calculation ? calculation.rowFieldId : undefined,
      rowFieldIds: "rowFieldIds" in calculation ? calculation.rowFieldIds : undefined,
      equals: "equals" in calculation ? calculation.equals : undefined,
      emptyValue: "emptyValue" in calculation ? calculation.emptyValue : undefined,
      values: "values" in calculation ? calculation.values : undefined,
      passAtOrAbove: "passAtOrAbove" in calculation ? calculation.passAtOrAbove : undefined,
      attentionAtOrAbove: "attentionAtOrAbove" in calculation ? calculation.attentionAtOrAbove : undefined,
      atOrAbove: "atOrAbove" in calculation ? calculation.atOrAbove : undefined
    });
  }

  return nextRow;
}

function normalizeRepeaterRowFieldValues(
  fieldDefinitions: Array<Exclude<ReportFieldDefinition, { type: "repeater" }>>,
  row: ReportRepeaterRow
) {
  const nextRow = { ...row };

  for (const field of fieldDefinitions) {
    nextRow[field.id] = normalizePrimitiveField(field, nextRow[field.id]);
  }

  return nextRow;
}

function applyRepeaterRowEnhancements(
  fieldDefinitions: Array<Exclude<ReportFieldDefinition, { type: "repeater" }>>,
  row: ReportRepeaterRow
) {
  return applyCustomValueSupport(
    fieldDefinitions,
    applyRepeaterRowCalculations(fieldDefinitions, normalizeRepeaterRowFieldValues(fieldDefinitions, row))
  );
}

function runFieldValidations(
  fieldDefinitions: ReportFieldDefinition[],
  fields: DraftSectionState["fields"],
  phase: "draft" | "finalize" = "draft"
) {
  for (const field of fieldDefinitions) {
    const fieldValue = fields[field.id];

    if (field.type === "repeater" && Array.isArray(fieldValue)) {
      for (const row of fieldValue) {
        if (!row || typeof row !== "object") {
          continue;
        }

        for (const rowField of field.rowFields) {
          if (!isFieldVisible(rowField, row)) {
            continue;
          }

          for (const validation of rowField.validation ?? []) {
            if (validation.type === "required" && phase === "finalize" && isEmptyValue(row[rowField.id])) {
              throw new Error(validation.message);
            }
          }
        }
      }
    }

    for (const validation of field.validation ?? []) {
      if (validation.type === "required" && isEmptyValue(fieldValue)) {
        throw new Error(validation.message);
      }

      if (validation.type === "minRows") {
        if (phase !== "finalize") {
          continue;
        }

        const rowCount = Array.isArray(fieldValue) ? fieldValue.length : 0;
        if (rowCount < validation.value) {
          throw new Error(validation.message);
        }
      }
    }
  }
}

function buildBaseSections(template: ReportTemplateDefinition) {
  return Object.fromEntries(
    template.sections.map((section) => [
      section.id,
      {
        status: "pending",
        notes: "",
        fields: Object.fromEntries(section.fields.map((field) => [field.id, defaultFieldValue(field)]))
      }
    ])
  );
}

function findFieldDefinition(fieldDefinitions: ReportFieldDefinition[], fieldId: string) {
  return fieldDefinitions.find((field) => field.id === fieldId) ?? null;
}

export function buildRepeaterRowDefaults(
  template: ReportTemplateDefinition,
  sectionId: string,
  repeaterFieldId: string,
  existingRowCount = 0
) {
  const section = template.sections.find((item) => item.id === sectionId);
  const repeaterField = section?.fields.find((field) => field.id === repeaterFieldId);
  if (!section || !repeaterField || repeaterField.type !== "repeater") {
    return {} as Record<string, ReportPrimitiveValue>;
  }

  const defaults = Object.fromEntries(
    repeaterField.rowFields.map((rowField) => {
      const defaultValue = rowField.prefill?.find((prefill) => prefill.source === "reportDefault")?.value;
      const sequentialDefaultValue = rowField.sequentialDefault && rowField.type !== "boolean"
        ? `${rowField.sequentialDefault.prefix} ${existingRowCount + 1}`
        : undefined;
      return [rowField.id, defaultValue ?? sequentialDefaultValue ?? defaultPrimitiveFieldValue(rowField.type)];
    })
  ) as Record<string, ReportPrimitiveValue>;

  defaults[INTERNAL_REPEATER_ROW_ID] = createRepeaterRowId();

  return applyRepeaterRowEnhancements(repeaterField.rowFields, defaults) as Record<string, ReportPrimitiveValue>;
}

export function applyFieldMappings(
  fieldDefinitions: Array<Exclude<ReportFieldDefinition, { type: "repeater" }>>,
  values: ReportRepeaterRow,
  changedFieldIds: string[] | string
) {
  const nextValues = { ...values };
  const changedIds = Array.isArray(changedFieldIds) ? changedFieldIds : [changedFieldIds];

  for (const changedFieldId of changedIds) {
    const changedField = findFieldDefinition(fieldDefinitions, changedFieldId);
    if (!changedField || changedField.type === "repeater") {
      continue;
    }

    const option = changedField.options?.find((item) => item.value === nextValues[changedFieldId]);
    if (!option?.metadata) {
      continue;
    }

    for (const mapping of changedField.mappings ?? []) {
      if (mapping.source !== "optionMetadata") {
        continue;
      }

      for (const target of mapping.targets) {
        const nextValue = option.metadata[target.sourceKey];
        if (nextValue === undefined) {
          continue;
        }

        if (target.mode === "always" || isEmptyValue(nextValues[target.fieldId])) {
          nextValues[target.fieldId] = nextValue;
        }
      }
    }
  }

  return nextValues;
}

export function applyRepeaterRowSmartUpdate(
  template: ReportTemplateDefinition,
  sectionId: string,
  repeaterFieldId: string,
  row: ReportRepeaterRow,
  changedFieldId: string
) {
  const section = template.sections.find((item) => item.id === sectionId);
  const repeaterField = section?.fields.find((field) => field.id === repeaterFieldId);
  if (!section || !repeaterField || repeaterField.type !== "repeater") {
    return row;
  }

  return applyRepeaterRowEnhancements(repeaterField.rowFields, applyFieldMappings(repeaterField.rowFields, row, changedFieldId));
}

export function duplicateRepeaterRows(
  rows: Array<Record<string, ReportPrimitiveValue>>,
  rowIndex: number
) {
  const sourceRow = rows[rowIndex];
  if (!sourceRow) {
    return rows;
  }

  return [
    ...rows.slice(0, rowIndex + 1),
    { ...sourceRow, [INTERNAL_REPEATER_ROW_ID]: createRepeaterRowId() },
    ...rows.slice(rowIndex + 1)
  ];
}

export function applyRepeaterBulkAction(
  template: ReportTemplateDefinition,
  sectionId: string,
  repeaterFieldId: string,
  rows: Array<Record<string, ReportPrimitiveValue>>,
  actionId: string
) {
  const section = template.sections.find((item) => item.id === sectionId);
  const repeaterField = section?.fields.find((field) => field.id === repeaterFieldId);
  if (!section || !repeaterField || repeaterField.type !== "repeater") {
    return rows;
  }

  const action = repeaterField.bulkActions?.find((item) => item.id === actionId);
  if (!action) {
    return rows;
  }

  return rows.map((row) => {
    const nextRow = { ...row };
    for (const target of action.targets) {
      nextRow[target.fieldId] = target.value;
    }
    return applyRepeaterRowEnhancements(repeaterField.rowFields, nextRow);
  });
}

function rowLabel(row: ReportRepeaterRow, rowIndex: number) {
  return describeRepeaterRowLabel(row, rowIndex);
}

function getRepeaterDeficiencyFieldIds(field: Extract<ReportFieldDefinition, { type: "repeater" }>) {
  return [...new Set([...(field.deficiencyFieldIds ?? []), ...(field.deficiencyFieldId ? [field.deficiencyFieldId] : [])])];
}

function rowHasDetectedDeficiency(row: ReportRepeaterRow, field: Extract<ReportFieldDefinition, { type: "repeater" }>) {
  const deficiencyFieldIds = getRepeaterDeficiencyFieldIds(field);
  return deficiencyFieldIds.some((fieldId) => DEFICIENCY_RESULT_VALUES.has(String(row[fieldId] ?? "").toLowerCase()));
}

function pickRowDeviceType(row: ReportRepeaterRow): string | null {
  const match = [row.deviceType, row.applianceType, row.componentType, row.protectedProcess, row.assemblyType, row.valveType]
    .find((value) => typeof value === "string" && value.trim().length > 0);

  return typeof match === "string" ? match : null;
}

function buildDetectedDeficiencyDescription(row: ReportRepeaterRow, rowLabelValue: string, matchedFieldIds: string[]) {
  const comments = typeof row.comments === "string" ? row.comments.trim() : "";
  if (comments) {
    return comments;
  }

  const deviceType = pickRowDeviceType(row);
  if (deviceType) {
    return `${String(deviceType).replaceAll("_", " ")} at ${rowLabelValue} failed inspection results for ${matchedFieldIds.map((fieldId) => fieldId.replaceAll(/([A-Z])/g, " $1").toLowerCase()).join(", ")}.`;
  }

  return `${rowLabelValue} failed inspection results.`;
}

function countCompletedRows(rows: ReportRepeaterRow[], completionFieldIds: string[]) {
  return rows.filter((row) => completionFieldIds.every((fieldId) => !isEmptyValue(row[fieldId]))).length;
}

function findDetectedDeficiencies(
  sectionId: string,
  sectionLabel: string,
  field: Extract<ReportFieldDefinition, { type: "repeater" }>,
  rows: ReportRepeaterRow[]
) {
  const deficiencyFieldIds = getRepeaterDeficiencyFieldIds(field);
  if (deficiencyFieldIds.length === 0) {
    return [] as ReportDetectedDeficiency[];
  }

  return rows.flatMap((row, rowIndex) => {
    const matchedFieldIds = deficiencyFieldIds.filter((fieldId) => DEFICIENCY_RESULT_VALUES.has(String(row[fieldId] ?? "").toLowerCase()));
    if (matchedFieldIds.length === 0) {
      return [];
    }

    const nextRowLabel = rowLabel(row, rowIndex);
    return [{
      sectionId,
      sectionLabel,
      repeaterFieldId: field.id,
      repeaterLabel: field.label,
      rowIndex,
      rowKey: String(row[INTERNAL_REPEATER_ROW_ID] ?? `${field.id}_${rowIndex}`),
      rowLabel: nextRowLabel,
      fieldId: matchedFieldIds[0] ?? deficiencyFieldIds[0]!,
      matchedFieldIds,
      assetId: typeof row.assetId === "string" && row.assetId ? row.assetId : null,
      assetTag: typeof row.assetTag === "string" && row.assetTag ? row.assetTag : null,
      location: typeof row.location === "string" && row.location ? row.location : null,
      deviceType: pickRowDeviceType(row),
      description: buildDetectedDeficiencyDescription(row, nextRowLabel, matchedFieldIds),
      severity: typeof row.deficiencySeverity === "string" && row.deficiencySeverity ? row.deficiencySeverity : "medium",
      notes: typeof row.deficiencyNotes === "string" ? row.deficiencyNotes : "",
      photoStorageKey: typeof row.deficiencyPhoto === "string" && row.deficiencyPhoto ? row.deficiencyPhoto : null
    }];
  });
}

export function buildInitialReportDraft(input: {
  inspectionType: InspectionType;
  siteName: string;
  customerName: string;
  scheduledDate: string;
  assetCount: number;
  previousDraft?: unknown;
  priorCompletedDraft?: unknown;
  priorReportSummary?: string;
  assets?: ReportAssetRecord[];
  siteDefaults?: Record<string, ReportPrimitiveValue>;
}) {
  const template = resolveReportTemplate({
    inspectionType: input.inspectionType,
    assets: input.assets ?? []
  });
  const previousDraft = parseOptionalDraft(input.previousDraft);
  const priorCompletedDraft = parseOptionalDraft(input.priorCompletedDraft);
  const baseSections = buildBaseSections(template);
  const smartContext: SmartBuildContext = {
    inspectionType: input.inspectionType,
    siteDefaults: {
      siteName: input.siteName,
      customerName: input.customerName,
      scheduledDate: input.scheduledDate,
      ...(input.siteDefaults ?? {})
    },
    assets: input.assets ?? [],
    priorDraft: priorCompletedDraft
  };

  const mergedSections = Object.fromEntries(
    template.sections.map((section) => {
      const currentSection = previousDraft?.sections?.[section.id];
      return [
        section.id,
        {
          status: currentSection?.status ?? "pending",
          notes: currentSection?.notes ?? "",
          fields: buildSectionFields(section, currentSection, smartContext)
        }
      ];
    })
  ) as Record<string, DraftSectionState>;

  for (const section of template.sections) {
    const currentSection = mergedSections[section.id];
    if (!currentSection) {
      continue;
    }

    mergedSections[section.id] = {
      status: currentSection.status,
      notes: currentSection.notes,
      fields: applyCalculatedFields(section.fields, currentSection.fields, mergedSections, section.id)
    };
  }

  return reportDraftSchema.parse({
    templateVersion: 1,
    inspectionType: input.inspectionType,
    overallNotes: previousDraft?.overallNotes ?? "",
    sectionOrder: template.sections.map((section) => section.id),
    activeSectionId: previousDraft?.activeSectionId ?? template.sections[0]?.id ?? null,
    sections: {
      ...baseSections,
      ...mergedSections
    },
    deficiencies: previousDraft?.deficiencies ?? [],
    attachments: previousDraft?.attachments ?? [],
    signatures: previousDraft?.signatures ?? {},
    context: {
      siteName: input.siteName,
      customerName: input.customerName,
      scheduledDate: input.scheduledDate,
      assetCount: input.assetCount,
      priorReportSummary: input.priorReportSummary ?? ""
    }
  });
}

export function validateDraftForTemplate(draft: unknown, expectedInspectionType: InspectionType, assets: ReportAssetRecord[] = []) {
  const parsed = reportDraftSchema.parse(draft);
  if (parsed.inspectionType !== expectedInspectionType) {
    throw new Error("Draft inspection type does not match this inspection task.");
  }

  const template = resolveReportTemplate({ inspectionType: expectedInspectionType, assets });
  const templateSectionIds = new Set(template.sections.map((section) => section.id));
  const normalizedSections = Object.fromEntries(
    template.sections.map((section) => {
      const currentSection = parsed.sections[section.id];
      const normalizedFieldEntries = Object.fromEntries(
        section.fields.map((field) => [field.id, normalizeFieldValue(field, currentSection?.fields?.[field.id])])
      );
      const normalizedFields = applyCustomValueSupport(
        section.fields.filter((field): field is Exclude<ReportFieldDefinition, { type: "repeater" }> => field.type !== "repeater"),
        normalizedFieldEntries
      );

      return [
        section.id,
        {
          status: currentSection?.status ?? "pending",
          notes: currentSection?.notes ?? "",
          fields: normalizedFields
        }
      ];
    })
  ) as Record<string, DraftSectionState>;

  for (const section of template.sections) {
    const currentSection = normalizedSections[section.id];
    if (!currentSection) {
      continue;
    }

    const calculatedFields = applyCalculatedFields(section.fields, currentSection.fields, normalizedSections, section.id);
    runFieldValidations(section.fields, calculatedFields);
    normalizedSections[section.id] = {
      status: currentSection.status,
      notes: currentSection.notes,
      fields: calculatedFields
    };
  }

  const normalizedActiveSectionId = parsed.activeSectionId && templateSectionIds.has(parsed.activeSectionId)
    ? parsed.activeSectionId
    : template.sections[0]?.id ?? null;

  return reportDraftSchema.parse({
    ...parsed,
    inspectionType: expectedInspectionType,
    sectionOrder: template.sections.map((section) => section.id),
    activeSectionId: normalizedActiveSectionId,
    sections: normalizedSections
  });
}

export function shouldAutosaveDraft(input: { dirty: boolean; millisecondsSinceLastSave: number; sectionChanged: boolean; saveInFlight?: boolean }) {
  if (!input.dirty || input.saveInFlight) {
    return false;
  }

  return input.sectionChanged || input.millisecondsSinceLastSave >= 3000;
}

export function canEditReport(actorRole: UserRole | string, reportStatus: ReportStatus) {
  if (reportStatus === "finalized") {
    return false;
  }

  return ["platform_admin", "tenant_admin", "office_admin", "technician"].includes(actorRole);
}

export function canFinalizeReport(actorRole: UserRole | string, reportStatus: ReportStatus) {
  if (!canEditReport(actorRole, reportStatus)) {
    return false;
  }

  return ["technician", "tenant_admin", "office_admin", "platform_admin"].includes(actorRole);
}

export function describeRepeaterRowLabel(row: Record<string, ReportPrimitiveValue>, rowIndex: number) {
  const location = typeof row.location === "string" && row.location ? row.location : null;
  const fixtureType = typeof row.fixtureType === "string" && row.fixtureType ? row.fixtureType : null;
  const appliance = typeof row.appliance === "string" && row.appliance ? row.appliance : null;
  const hoodName = typeof row.hoodName === "string" && row.hoodName ? row.hoodName : null;
  const deviceType = typeof row.deviceType === "string" && row.deviceType ? row.deviceType : null;
  const componentType = typeof row.componentType === "string" && row.componentType ? row.componentType : null;
  const protectedProcess = typeof row.protectedProcess === "string" && row.protectedProcess ? row.protectedProcess : null;
  const assemblyType = typeof row.assemblyType === "string" && row.assemblyType ? row.assemblyType : null;

  if (fixtureType && location) {
    return `${fixtureType} at ${location}`;
  }

  if (appliance && hoodName) {
    return `${appliance} (${hoodName})`;
  }

  if (location) {
    return location;
  }

  if (deviceType) {
    return deviceType;
  }

  if (componentType) {
    return componentType;
  }

  if (protectedProcess) {
    return protectedProcess;
  }

  if (assemblyType) {
    return assemblyType;
  }

  return `Item ${rowIndex + 1}`;
}

export function describeRepeaterValueLines(
  field: Extract<ReportFieldDefinition, { type: "repeater" }>,
  value: unknown
) {
  const rows = Array.isArray(value)
    ? value.filter((row) => typeof row === "object" && row !== null) as Array<Record<string, ReportPrimitiveValue>>
    : [];
  if (rows.length === 0) {
    return ["No items recorded."];
  }

  return rows.flatMap((row, rowIndex) => {
    const rowLabel = describeRepeaterRowLabel(row, rowIndex);
    const lines = [`${field.label} ${rowIndex + 1}: ${rowLabel}`];
    for (const rowField of field.rowFields.filter((item) => isFieldVisible(item, row))) {
      if (rowField.id === "assetId" || rowField.id === "assetTag") {
        continue;
      }

      const value = row[rowField.id];
      const formattedValue = typeof value === "boolean"
        ? value ? "Yes" : "No"
        : value === null || value === undefined || value === ""
          ? "Not recorded"
          : typeof value === "string" && (value.startsWith("blob:") || value.startsWith("data:image/"))
            ? "Photo attached"
            : String(value);
      lines.push(`  ${rowField.label}: ${formattedValue}`);
    }

    return lines;
  });
}

export function validateFinalizationDraft(draft: ReportDraft, assets: ReportAssetRecord[] = []) {
  const template = resolveReportTemplate({ inspectionType: draft.inspectionType as InspectionType, assets });

  for (const section of template.sections) {
    const sectionState = draft.sections[section.id];
    if (!sectionState) {
      continue;
    }

    runFieldValidations(section.fields, sectionState.fields, "finalize");
  }

  if (!draft.signatures.technician?.signerName || !draft.signatures.technician?.imageDataUrl || !draft.signatures.customer?.signerName || !draft.signatures.customer?.imageDataUrl) {
    throw new Error("Technician and customer signatures are required before finalization.");
  }

  const incompleteSections = draft.sectionOrder.filter((sectionId) => (draft.sections[sectionId]?.status ?? "pending") === "pending");
  if (incompleteSections.length > 0) {
    throw new Error("All report sections must be marked before finalization.");
  }

  return true;
}

export function normalizeSignaturePayload(kind: SignatureKind, input: { signerName: string; imageDataUrl: string; signedAt?: string }) {
  return {
    kind,
    signerName: input.signerName.trim(),
    imageDataUrl: input.imageDataUrl,
    signedAt: input.signedAt ?? new Date().toISOString()
  };
}

export function buildReportPreview(draft: ReportDraft): ReportPreview {
  const template = resolveReportTemplate({ inspectionType: draft.inspectionType as InspectionType });
  const sectionSummaries = template.sections.map((section) => {
    const sectionState = draft.sections[section.id];
    let completedRows = 0;
    let totalRows = 0;
    let deficiencyCount = 0;

    for (const field of section.fields) {
      if (field.type !== "repeater") {
        continue;
      }

      const rows = Array.isArray(sectionState?.fields?.[field.id])
        ? sectionState?.fields?.[field.id] as ReportRepeaterRow[]
        : [];
      if (field.completionFieldIds && field.completionFieldIds.length > 0) {
        totalRows += rows.length;
        completedRows += countCompletedRows(rows, field.completionFieldIds);
      }
      if (getRepeaterDeficiencyFieldIds(field).length > 0) {
        deficiencyCount += rows.filter((row) => rowHasDetectedDeficiency(row, field)).length;
      }
    }

    let completionState: ReportSectionCompletionState = "not_started";
    if (totalRows > 0) {
      completionState = completedRows >= totalRows ? "complete" : completedRows > 0 ? "partial" : "not_started";
    } else if ((sectionState?.status ?? "pending") !== "pending") {
      completionState = "complete";
    }

    return {
      sectionId: section.id,
      sectionLabel: section.label,
      status: sectionState?.status ?? "pending",
      notes: sectionState?.notes ?? "",
      completionState,
      completedRows,
      totalRows,
      deficiencyCount
    };
  });

  const detectedDeficiencies = template.sections.flatMap((section) => {
    const sectionState = draft.sections[section.id];
    return section.fields.flatMap((field) => {
      if (field.type !== "repeater") {
        return [];
      }
      const rows = Array.isArray(sectionState?.fields?.[field.id])
        ? sectionState?.fields?.[field.id] as ReportRepeaterRow[]
        : [];
      return findDetectedDeficiencies(section.id, section.label, field, rows);
    });
  });

  const failingSections = Object.entries(draft.sections)
    .filter(([, section]) => section.status === "fail")
    .map(([sectionId]) => sectionId);

  const totalRows = sectionSummaries.reduce((sum, section) => sum + section.totalRows, 0);
  const completedRows = sectionSummaries.reduce((sum, section) => sum + section.completedRows, 0);
  const deficiencyCount = detectedDeficiencies.length;
  const completedSectionCount = sectionSummaries.filter((section) => section.status !== "pending").length;
  const sectionCompletion = sectionSummaries.length > 0 ? completedSectionCount / sectionSummaries.length : 0;
  const rowCompletion = totalRows > 0 ? completedRows / totalRows : 0;
  const reportCompletion = totalRows > 0
    ? rowCompletion >= 1 && completedSectionCount < sectionSummaries.length
      ? sectionCompletion
      : rowCompletion
    : sectionCompletion;

  return {
    sectionSummaries,
    deficiencyCount,
    manualDeficiencyCount: draft.deficiencies.length,
    attachmentCount: draft.attachments.length,
    failingSections,
    inspectionStatus: deficiencyCount > 0 || draft.deficiencies.length > 0 ? "deficiencies_found" : "pass",
    reportCompletion,
    completedRows,
    totalRows,
    detectedDeficiencies
  };
}

export type { ReportTemplateDefinition, ReportAssetRecord, ReportPrimitiveValue };
