import type { InspectionType } from "@testworx/types";

import type { ReportDraft } from "./report-engine";
import type { ReportFieldDefinition, ReportPrimitiveValue, ReportTemplateDefinition } from "./report-config";
import { describeRepeaterRowLabel } from "./report-engine";

export const mobileChecklistInspectionTypeAllowlist = [
  "fire_alarm",
  "kitchen_suppression",
  "fire_extinguisher"
] as const satisfies readonly InspectionType[];

export type MobileChecklistInspectionType = (typeof mobileChecklistInspectionTypeAllowlist)[number];

export type MobileChecklistState = "positive" | "negative" | "not_applicable";

export type MobileChecklistItem = {
  id: string;
  sectionId: string;
  sectionLabel: string;
  title: string;
  description: string | null;
  groupLabel: string | null;
  rawValue: string;
  status: MobileChecklistState | null;
  supportsNotApplicable: boolean;
  noteFieldId: string | null;
  deficiencyNoteFieldId: string | null;
  deficiencySeverityFieldId: string | null;
  deficiencyPhotoFieldId: string | null;
  noteValue: string;
  deficiencyNoteValue: string;
  deficiencySeverityValue: string;
  deficiencyPhotoStorageKey: string | null;
  kind:
    | {
        type: "section-field";
        fieldId: string;
      }
    | {
        type: "repeater-row-field";
        fieldId: string;
        rowFieldId: string;
        rowIndex: number;
        rowKey: string;
      };
};

export type MobileChecklistSection = {
  sectionId: string;
  sectionLabel: string;
  items: MobileChecklistItem[];
};

export type MobileChecklistViewModel = {
  sections: MobileChecklistSection[];
  items: MobileChecklistItem[];
  completedCount: number;
  totalCount: number;
  positiveCount: number;
  negativeCount: number;
  notApplicableCount: number;
};

const positiveOptionValues = new Set(["pass", "yes", "good", "normal", "stable", "current", "compliant"]);
const negativeOptionValues = new Set(["fail", "no", "deficiency", "damaged", "attention", "poor", "low", "high", "needs_repair"]);
const notApplicableOptionValues = new Set(["na", "not_applicable"]);

function getNormalizedChecklistState(value: string) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (positiveOptionValues.has(normalized)) {
    return "positive" as const;
  }

  if (negativeOptionValues.has(normalized)) {
    return "negative" as const;
  }

  if (notApplicableOptionValues.has(normalized)) {
    return "not_applicable" as const;
  }

  return null;
}

function isChecklistCompatibleField(field: Exclude<ReportFieldDefinition, { type: "repeater" }>) {
  if (field.hidden || field.readOnly || field.type !== "select") {
    return false;
  }

  const states = new Set((field.options ?? []).map((option) => getNormalizedChecklistState(option.value)).filter(Boolean));
  return states.has("positive") && states.has("negative");
}

function getChecklistRowNoteFieldId(rowFields: Array<Exclude<ReportFieldDefinition, { type: "repeater" }>>) {
  return rowFields.find((rowField) => !rowField.hidden && rowField.type === "text" && (rowField.id === "comments" || rowField.id === "notes"))?.id ?? null;
}

function getRowValue(row: Record<string, ReportPrimitiveValue>, fieldId: string | null) {
  if (!fieldId) {
    return "";
  }

  const value = row[fieldId];
  return typeof value === "string" ? value : "";
}

function getScalarValue(sectionFields: Record<string, ReportPrimitiveValue>, fieldId: string | null) {
  if (!fieldId) {
    return "";
  }

  const value = sectionFields[fieldId];
  return typeof value === "string" ? value : "";
}

export function isChecklistHeavyMobileInspectionType(inspectionType: InspectionType): inspectionType is MobileChecklistInspectionType {
  return mobileChecklistInspectionTypeAllowlist.includes(inspectionType as MobileChecklistInspectionType);
}

export function isChecklistHeavyMobileField(field: Exclude<ReportFieldDefinition, { type: "repeater" }>) {
  return isChecklistCompatibleField(field);
}

export function buildMobileChecklistViewModel(template: ReportTemplateDefinition, draft: ReportDraft): MobileChecklistViewModel {
  const sections: MobileChecklistSection[] = [];

  for (const section of template.sections) {
    const sectionState = draft.sections[section.id];
    const sectionFields = sectionState?.fields as Record<string, ReportPrimitiveValue> | undefined;
    const items: MobileChecklistItem[] = [];

    for (const field of section.fields) {
      if (field.type === "repeater") {
        const rows = Array.isArray(sectionFields?.[field.id])
          ? sectionFields?.[field.id] as unknown as Array<Record<string, ReportPrimitiveValue>>
          : [];
        const noteFieldId = getChecklistRowNoteFieldId(field.rowFields);
        const deficiencyNoteFieldId = field.rowFields.find((rowField) => rowField.hidden && rowField.type === "text" && rowField.id === "deficiencyNotes")?.id ?? null;
        const deficiencySeverityFieldId = field.rowFields.find((rowField) => rowField.hidden && rowField.type === "select" && rowField.id === "deficiencySeverity")?.id ?? null;
        const deficiencyPhotoFieldId = field.rowFields.find((rowField) => rowField.hidden && rowField.type === "photo" && rowField.id === "deficiencyPhoto")?.id ?? null;

        rows.forEach((row, rowIndex) => {
          const groupLabel = describeRepeaterRowLabel(row, rowIndex);
          const rowKey = typeof row.__rowId === "string" && row.__rowId.length > 0 ? row.__rowId : `${field.id}_${rowIndex}`;

          for (const rowField of field.rowFields) {
            if (!isChecklistCompatibleField(rowField)) {
              continue;
            }

            const rawValue = typeof row[rowField.id] === "string" ? String(row[rowField.id]) : "";
            items.push({
              id: `${section.id}:${field.id}:${rowKey}:${rowField.id}`,
              sectionId: section.id,
              sectionLabel: section.label,
              title: rowField.label,
              description: rowField.description ?? null,
              groupLabel,
              rawValue,
              status: getNormalizedChecklistState(rawValue),
              supportsNotApplicable: (rowField.options ?? []).some((option) => getNormalizedChecklistState(option.value) === "not_applicable"),
              noteFieldId,
              deficiencyNoteFieldId,
              deficiencySeverityFieldId,
              deficiencyPhotoFieldId,
              noteValue: getRowValue(row, noteFieldId),
              deficiencyNoteValue: getRowValue(row, deficiencyNoteFieldId),
              deficiencySeverityValue: getRowValue(row, deficiencySeverityFieldId),
              deficiencyPhotoStorageKey: getRowValue(row, deficiencyPhotoFieldId) || null,
              kind: {
                type: "repeater-row-field",
                fieldId: field.id,
                rowFieldId: rowField.id,
                rowIndex,
                rowKey
              }
            });
          }
        });

        continue;
      }

      if (!isChecklistCompatibleField(field)) {
        continue;
      }

      const rawValue = typeof sectionFields?.[field.id] === "string" ? String(sectionFields?.[field.id]) : "";
      items.push({
        id: `${section.id}:${field.id}`,
        sectionId: section.id,
        sectionLabel: section.label,
        title: field.label,
        description: field.description ?? null,
        groupLabel: null,
        rawValue,
        status: getNormalizedChecklistState(rawValue),
        supportsNotApplicable: (field.options ?? []).some((option) => getNormalizedChecklistState(option.value) === "not_applicable"),
        noteFieldId: null,
        deficiencyNoteFieldId: null,
        deficiencySeverityFieldId: null,
        deficiencyPhotoFieldId: null,
        noteValue: "",
        deficiencyNoteValue: "",
        deficiencySeverityValue: "",
        deficiencyPhotoStorageKey: null,
        kind: {
          type: "section-field",
          fieldId: field.id
        }
      });
    }

    sections.push({
      sectionId: section.id,
      sectionLabel: section.label,
      items
    });
  }

  const allItems = sections.flatMap((section) => section.items);
  const positiveCount = allItems.filter((item) => item.status === "positive").length;
  const negativeCount = allItems.filter((item) => item.status === "negative").length;
  const notApplicableCount = allItems.filter((item) => item.status === "not_applicable").length;

  return {
    sections,
    items: allItems,
    completedCount: positiveCount + negativeCount + notApplicableCount,
    totalCount: allItems.length,
    positiveCount,
    negativeCount,
    notApplicableCount
  };
}
