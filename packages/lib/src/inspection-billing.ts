import { Prisma } from "@prisma/client";
import { prisma } from "@testworx/db";

import type { ActorContext, InspectionType, ReportStatus } from "@testworx/types";
import { actorContextSchema, reportStatuses } from "@testworx/types";

import type { JsonValue } from "./json-types";
import type { BillableCategory, BillableFieldMapping, BillableRepeaterMapping } from "./report-config";
import { resolveReportTemplate } from "./report-config";
import { assertTenantContext } from "./permissions";
import { reportDraftSchema, type ReportDraft, type ReportPrimitiveValue } from "./report-engine";
import { resolveInspectionServiceFeeTx } from "./service-fees";

type TransactionClient = Prisma.TransactionClient;

export type BillableItem = {
  id: string;
  tenantId: string;
  inspectionId: string;
  reportId: string;
  reportType: string;
  sourceSection?: string;
  sourceField?: string;
  category: BillableCategory;
  code?: string;
  description: string;
  quantity: number;
  unit?: string;
  unitPrice?: number | null;
  amount?: number | null;
  metadata?: Record<string, unknown>;
  linkedCatalogItemId?: string | null;
  linkedCatalogItemName?: string | null;
  linkedQuickBooksItemId?: string | null;
  linkedMatchMethod?: string | null;
  linkedMatchConfidence?: number | null;
};

export type BillingCatalogMatchMethod = "exact" | "normalized" | "alias" | "fuzzy" | "source_mapping" | "manual";

export type BillingCatalogMatchSuggestion = {
  catalogItemId: string;
  quickbooksItemId: string;
  name: string;
  sku: string | null;
  itemType: string;
  unitPrice: number | null;
  alias: string | null;
  confidence: number;
  matchMethod: BillingCatalogMatchMethod;
  autoMatchEligible: boolean;
};

type BillingItemCatalogMatchRecord = {
  sourceKey: string;
  catalogItemId: string;
  confidence: number;
  matchMethod: string;
  catalogItem: {
    id: string;
    quickbooksItemId: string;
    name: string;
    sku: string | null;
    itemType: string;
    unitPrice: number | null;
  };
};

const AUTO_MATCH_CONFIDENCE_THRESHOLD = 0.96;
const SUGGESTED_MATCH_CONFIDENCE_THRESHOLD = 0.72;

export type BillingSummaryStatus = "draft" | "reviewed" | "invoiced";

type PersistedBillingSummary = {
  id: string;
  tenantId: string;
  inspectionId: string;
  customerCompanyId: string;
  siteId: string;
  status: BillingSummaryStatus;
  items: BillableItem[];
  subtotal: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type PersistedBillingSummaryRow = {
  id: string;
  tenantId: string;
  inspectionId: string;
  customerCompanyId: string;
  siteId: string;
  status: string;
  items: JsonValue;
  subtotal: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type BillingSummaryListRow = {
  id: string;
  inspectionId: string;
  customerCompanyId: string;
  customerName: string;
  siteId: string;
  siteName: string;
  inspectionDate: Date;
  technicianName: string | null;
  status: BillingSummaryStatus;
  quickbooksSyncStatus: string | null;
  quickbooksInvoiceId: string | null;
  quickbooksInvoiceNumber: string | null;
  quickbooksConnectionMode: string | null;
  quickbooksSyncedAt: Date | null;
  quickbooksSyncError: string | null;
  subtotal: number;
  notes: string | null;
  items: BillableItem[];
};

type AdminBillingSummaryDetailRow = {
  id: string;
  inspectionId: string;
  customerCompanyId: string;
  customerName: string;
  siteId: string;
  siteName: string;
  inspectionDate: Date;
  technicianName: string | null;
  status: string;
  quickbooksSyncStatus: string | null;
  quickbooksInvoiceId: string | null;
  quickbooksInvoiceNumber: string | null;
  quickbooksConnectionMode: string | null;
  quickbooksSyncedAt: Date | null;
  quickbooksSyncError: string | null;
  subtotal: number;
  notes: string | null;
  items: JsonValue;
};

type AuthorizedBillingSummaryRow = {
  id: string;
  tenantId: string;
  inspectionId: string;
  status: string;
  subtotal: number;
  notes: string | null;
  items: JsonValue;
  quickbooksSyncStatus: string | null;
  quickbooksInvoiceId: string | null;
};

type FinalizedReportRow = {
  id: string;
  inspectionId: string;
  tenantId: string;
  contentJson: JsonValue | null;
  inspectionType: InspectionType;
};

type InspectionRow = {
  inspectionId: string;
  customerCompanyId: string;
  siteId: string;
};

const INSPECTION_LEVEL_REPORT_TYPE = "inspection";

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

function isAdminRole(role: string) {
  return ["platform_admin", "tenant_admin", "office_admin"].includes(role);
}

function normalizeMatchText(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularizeToken(token: string) {
  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith("es") && token.length > 3) {
    return token.slice(0, -2);
  }

  if (token.endsWith("s") && token.length > 3) {
    return token.slice(0, -1);
  }

  return token;
}

function tokenizeMatchText(value: string | null | undefined) {
  return normalizeMatchText(value)
    .split(" ")
    .map((token) => singularizeToken(token))
    .filter(Boolean);
}

function buildNormalizedTokenString(value: string | null | undefined) {
  return tokenizeMatchText(value).join(" ");
}

function buildBillingItemSourceKey(item: Pick<BillableItem, "category" | "reportType" | "sourceSection" | "sourceField" | "code" | "description">) {
  return [
    item.category,
    item.reportType,
    item.sourceSection ?? "unknown_section",
    item.sourceField ?? "unknown_field",
    normalizeMatchText(item.code ?? ""),
    buildNormalizedTokenString(item.description)
  ].join("|");
}

function buildBillingItemSearchQuery(item: Pick<BillableItem, "code" | "description">) {
  return item.code?.trim() || item.description.trim();
}

function calculateTokenOverlapScore(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let shared = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      shared += 1;
    }
  }

  return (2 * shared) / (leftSet.size + rightSet.size);
}

function scoreCatalogMatch(input: {
  item: Pick<BillableItem, "code" | "description">;
  catalogName: string;
  alias?: string | null;
  sku?: string | null;
}) {
  const sourceNormalized = buildNormalizedTokenString(input.item.description);
  const sourceRawNormalized = normalizeMatchText(input.item.description);
  const candidateNormalized = buildNormalizedTokenString(input.alias ?? input.catalogName);
  const candidateRawNormalized = normalizeMatchText(input.alias ?? input.catalogName);
  const sourceTokens = tokenizeMatchText(input.item.description);
  const candidateTokens = tokenizeMatchText(input.alias ?? input.catalogName);
  const normalizedCode = normalizeMatchText(input.item.code ?? "");
  const normalizedSku = normalizeMatchText(input.sku ?? "");

  if (normalizedCode && normalizedSku && normalizedCode === normalizedSku) {
    return { confidence: 1, matchMethod: "exact" as const };
  }

  if (sourceRawNormalized && sourceRawNormalized === candidateRawNormalized) {
    return { confidence: input.alias ? 0.99 : 0.98, matchMethod: input.alias ? "alias" as const : "exact" as const };
  }

  if (sourceNormalized && sourceNormalized === candidateNormalized) {
    return { confidence: input.alias ? 0.97 : 0.95, matchMethod: input.alias ? "alias" as const : "normalized" as const };
  }

  const overlapScore = calculateTokenOverlapScore(sourceTokens, candidateTokens);
  const sourceContainsCandidate = sourceNormalized.includes(candidateNormalized) && candidateNormalized.length > 0;
  const candidateContainsSource = candidateNormalized.includes(sourceNormalized) && sourceNormalized.length > 0;
  const containsBonus = sourceContainsCandidate || candidateContainsSource ? 0.12 : 0;
  const aliasBonus = input.alias ? 0.08 : 0;
  const codeBonus = normalizedCode && normalizedSku && normalizedSku.includes(normalizedCode) ? 0.1 : 0;
  const confidence = Math.min(overlapScore + containsBonus + aliasBonus + codeBonus, 0.94);

  return {
    confidence,
    matchMethod: input.alias ? "alias" as const : "fuzzy" as const
  };
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function findSectionValue(draft: ReportDraft, fieldId: string, sourceSection?: string): { value: unknown; sectionId?: string } {
  if (sourceSection) {
    return {
      value: draft.sections[sourceSection]?.fields?.[fieldId],
      sectionId: sourceSection
    };
  }

  for (const [sectionId, section] of Object.entries(draft.sections)) {
    if (fieldId in section.fields) {
      return { value: section.fields[fieldId], sectionId };
    }
  }

  return { value: undefined, sectionId: undefined };
}

function shouldIncludeValue(value: unknown, mapping: Pick<BillableFieldMapping | BillableRepeaterMapping, "includeWhenTruthy" | "includeWhenGreaterThanZero">) {
  if (mapping.includeWhenGreaterThanZero) {
    const numberValue = toNumber(value);
    return numberValue !== null && numberValue > 0;
  }

  if (mapping.includeWhenTruthy) {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      return value > 0;
    }

    if (typeof value === "string") {
      return value.trim().length > 0 && value !== "0";
    }

    return Boolean(value);
  }

  return value !== undefined && value !== null && value !== "";
}

function matchesFieldValueConditions(
  row: Record<string, unknown>,
  conditions: Array<{ field: string; values: ReportPrimitiveValue[] }> | undefined
) {
  if (!conditions || conditions.length === 0) {
    return true;
  }

  return conditions.every((condition) => condition.values.includes((row[condition.field] ?? null) as ReportPrimitiveValue));
}

function shouldIncludeBillableEntry(
  value: unknown,
  mapping: Pick<
    BillableFieldMapping | BillableRepeaterMapping,
    "alwaysInclude" | "includeWhenTruthy" | "includeWhenGreaterThanZero" | "includeWhenFieldValues" | "excludeWhenFieldValues"
  >,
  row: Record<string, unknown>
) {
  if (!matchesFieldValueConditions(row, mapping.includeWhenFieldValues)) {
    return false;
  }

  if (mapping.excludeWhenFieldValues && mapping.excludeWhenFieldValues.length > 0) {
    const isExcluded = mapping.excludeWhenFieldValues.some((condition) =>
      condition.values.includes((row[condition.field] ?? null) as ReportPrimitiveValue)
    );
    if (isExcluded) {
      return false;
    }
  }

  if (mapping.alwaysInclude) {
    return true;
  }

  return shouldIncludeValue(value, mapping);
}

function resolveQuantity(value: unknown, mapping: Pick<BillableFieldMapping | BillableRepeaterMapping, "quantitySource" | "quantityConstant">) {
  if (mapping.quantitySource === "constant") {
    return mapping.quantityConstant ?? 1;
  }

  const numericValue = toNumber(value);
  if (numericValue !== null) {
    return numericValue;
  }

  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  return 0;
}

function interpolateDescription(template: string, row: Record<string, ReportPrimitiveValue>) {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, token) => {
    const value = row[token.trim()];
    return value === null || value === undefined || value === "" ? "Not recorded" : String(value);
  });
}

function sanitizeBillingCodeSegment(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "NOT_RECORDED";
  }

  return text
    .replace(/°/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .toUpperCase() || "NOT_RECORDED";
}

function interpolateCodeTemplate(template: string, row: Record<string, ReportPrimitiveValue>) {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, token) => sanitizeBillingCodeSegment(row[token.trim()]));
}

function buildBillableMetadata(
  baseMetadata: Record<string, unknown>,
  source: Record<string, unknown>,
  metadataFields?: string[]
) {
  if (!metadataFields || metadataFields.length === 0) {
    return baseMetadata;
  }

  const extraMetadata = metadataFields.reduce<Record<string, unknown>>((accumulator, field) => {
    accumulator[field] = source[field] ?? null;
    return accumulator;
  }, {});

  return {
    ...baseMetadata,
    ...extraMetadata
  };
}

function normalizeBillableSelectionValues(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[;,|]\s*/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return [];
}

function resolveBillableExtinguisherType(row: Record<string, ReportPrimitiveValue>) {
  return row.billingExtinguisherType ?? row.extinguisherTypeOther ?? row.extinguisherType ?? null;
}

function calculateAmount(quantity: number, unitPrice?: number | null) {
  return typeof unitPrice === "number" ? Number((quantity * unitPrice).toFixed(2)) : null;
}

function normalizeExistingItems(input: unknown): BillableItem[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.filter((item) => item && typeof item === "object").map((item) => item as BillableItem);
}

export function extractBillableItemsFromDraft(input: {
  tenantId: string;
  inspectionId: string;
  reportId: string;
  reportType: InspectionType;
  draft: ReportDraft;
}) {
  const template = resolveReportTemplate({ inspectionType: input.reportType });
  const mappings = template.billableMappings;
  if (!mappings) {
    return [] as BillableItem[];
  }

  const extracted: BillableItem[] = [];

  for (const mapping of mappings.fields ?? []) {
    const resolved = findSectionValue(input.draft, mapping.field, mapping.sourceSection);
    const value = resolved.value;
    const sourceSection = mapping.sourceSection ?? resolved.sectionId;
    const descriptionFields = sourceSection && input.draft.sections[sourceSection]
      ? input.draft.sections[sourceSection]!.fields as Record<string, ReportPrimitiveValue>
      : {};
    if (!shouldIncludeBillableEntry(value, mapping, descriptionFields)) {
      continue;
    }

    const quantity = resolveQuantity(value, mapping);
    if (quantity <= 0) {
      continue;
    }

    extracted.push({
      id: `${input.reportId}:${sourceSection ?? "unknown"}:${mapping.field}`,
      tenantId: input.tenantId,
      inspectionId: input.inspectionId,
      reportId: input.reportId,
      reportType: input.reportType,
      sourceSection,
      sourceField: mapping.field,
      category: mapping.category,
      code: mapping.codeField
        ? (descriptionFields[mapping.codeField] !== null && descriptionFields[mapping.codeField] !== undefined && descriptionFields[mapping.codeField] !== ""
          ? String(descriptionFields[mapping.codeField])
          : mapping.code)
        : mapping.code,
      description: mapping.descriptionTemplate
        ? interpolateDescription(mapping.descriptionTemplate, descriptionFields)
        : mapping.description,
      quantity,
      unit: mapping.unit,
      unitPrice: mapping.unitPrice ?? null,
      amount: calculateAmount(quantity, mapping.unitPrice ?? null),
      metadata: buildBillableMetadata({
        displayGroup: mapping.displayGroup ?? mapping.category,
        sourceValue: value ?? null
      }, descriptionFields, mapping.metadataFields)
    });
  }

  for (const mapping of mappings.repeaters ?? []) {
    const resolved = findSectionValue(input.draft, mapping.repeater, mapping.sourceSection);
    const rows = resolved.value;
    const sourceSection = mapping.sourceSection ?? resolved.sectionId;
    if (!Array.isArray(rows)) {
      continue;
    }

    for (const row of rows) {
      if (!row || typeof row !== "object") {
        continue;
      }

      const typedRow = row as Record<string, ReportPrimitiveValue>;
      const value = typedRow[mapping.field];
      const rowIdentity = typeof typedRow.assetId === "string" && typedRow.assetId
        ? typedRow.assetId
        : typeof typedRow.assetTag === "string" && typedRow.assetTag
          ? typedRow.assetTag
          : crypto.randomUUID();

      if (mapping.includePerRow) {
        if (!shouldIncludeBillableEntry(value, mapping, typedRow)) {
          continue;
        }

        const quantity = resolveQuantity(1, mapping);
        if (quantity <= 0) {
          continue;
        }

        extracted.push({
          id: `${input.reportId}:${sourceSection ?? "unknown"}:${mapping.repeater}:${mapping.field}:${rowIdentity}:ROW`,
          tenantId: input.tenantId,
          inspectionId: input.inspectionId,
          reportId: input.reportId,
          reportType: input.reportType,
          sourceSection,
          sourceField: mapping.field,
          category: mapping.category,
          code: mapping.codeField
            ? (typedRow[mapping.codeField] !== null && typedRow[mapping.codeField] !== undefined && typedRow[mapping.codeField] !== ""
              ? String(typedRow[mapping.codeField])
              : mapping.code ?? (mapping.codeTemplate ? interpolateCodeTemplate(mapping.codeTemplate, typedRow) : undefined))
            : mapping.code ?? (mapping.codeTemplate ? interpolateCodeTemplate(mapping.codeTemplate, typedRow) : undefined),
          description: interpolateDescription(mapping.descriptionTemplate, {
            ...typedRow,
            billingExtinguisherType: resolveBillableExtinguisherType(typedRow)
          }),
          quantity,
          unit: mapping.unit,
          unitPrice: mapping.unitPrice ?? null,
          amount: calculateAmount(quantity, mapping.unitPrice ?? null),
          metadata: buildBillableMetadata({
            displayGroup: mapping.displayGroup ?? mapping.category,
            repeater: mapping.repeater,
            assetId: typedRow.assetId ?? null,
            assetTag: typedRow.assetTag ?? null,
            location: typedRow.location ?? null
          }, typedRow, mapping.metadataFields)
        });

        continue;
      }

      if (mapping.expandValues) {
        const selectedValues = normalizeBillableSelectionValues(value)
          .filter((entry) => !mapping.includeValues || mapping.includeValues.includes(entry))
          .filter((entry) => !mapping.excludeValues || !mapping.excludeValues.includes(entry));

        for (const selectedValue of selectedValues) {
          const detailValue = mapping.otherValue && selectedValue === mapping.otherValue
            ? (typedRow[mapping.otherDetailField ?? ""] ?? selectedValue)
            : selectedValue;
          const interpolationRow: Record<string, ReportPrimitiveValue> = {
            ...typedRow,
            billingExtinguisherType: resolveBillableExtinguisherType(typedRow),
            billingValue: selectedValue,
            billingValueDescription: detailValue === null || detailValue === undefined || detailValue === "" ? selectedValue : detailValue,
            billingValueCode: mapping.valueCodeMap?.[selectedValue] ?? selectedValue
          };
          const quantity = resolveQuantity(selectedValue, mapping);
          if (quantity <= 0) {
            continue;
          }

          extracted.push({
            id: `${input.reportId}:${sourceSection ?? "unknown"}:${mapping.repeater}:${mapping.field}:${rowIdentity}:${sanitizeBillingCodeSegment(selectedValue)}`,
            tenantId: input.tenantId,
            inspectionId: input.inspectionId,
            reportId: input.reportId,
            reportType: input.reportType,
            sourceSection,
            sourceField: mapping.field,
            category: mapping.category,
            code: mapping.codeField
              ? (interpolationRow[mapping.codeField] !== null && interpolationRow[mapping.codeField] !== undefined && interpolationRow[mapping.codeField] !== ""
                ? String(interpolationRow[mapping.codeField])
                : mapping.staticCodeByValue?.[selectedValue] ?? mapping.code ?? (mapping.codeTemplate ? interpolateCodeTemplate(mapping.codeTemplate, interpolationRow) : undefined))
              : mapping.staticCodeByValue?.[selectedValue] ?? mapping.code ?? (mapping.codeTemplate ? interpolateCodeTemplate(mapping.codeTemplate, interpolationRow) : undefined),
            description: interpolateDescription(mapping.descriptionTemplate, interpolationRow),
            quantity,
            unit: mapping.unit,
            unitPrice: mapping.unitPrice ?? null,
            amount: calculateAmount(quantity, mapping.unitPrice ?? null),
            metadata: buildBillableMetadata({
              displayGroup: mapping.displayGroup ?? mapping.category,
              repeater: mapping.repeater,
              assetId: typedRow.assetId ?? null,
              assetTag: typedRow.assetTag ?? null,
              location: typedRow.location ?? null,
              billingValue: selectedValue,
              billingValueDescription: interpolationRow.billingValueDescription
            }, interpolationRow, mapping.metadataFields)
          });
        }

        continue;
      }

      if (!shouldIncludeBillableEntry(value, mapping, typedRow)) {
        continue;
      }

      const quantity = resolveQuantity(value, mapping);
      if (quantity <= 0) {
        continue;
      }

      extracted.push({
        id: `${input.reportId}:${sourceSection ?? "unknown"}:${mapping.repeater}:${mapping.field}:${rowIdentity}`,
        tenantId: input.tenantId,
        inspectionId: input.inspectionId,
        reportId: input.reportId,
        reportType: input.reportType,
        sourceSection,
        sourceField: mapping.field,
        category: mapping.category,
        code: mapping.codeField
          ? (typedRow[mapping.codeField] !== null && typedRow[mapping.codeField] !== undefined && typedRow[mapping.codeField] !== ""
            ? String(typedRow[mapping.codeField])
            : mapping.code ?? (mapping.codeTemplate ? interpolateCodeTemplate(mapping.codeTemplate, typedRow) : undefined))
          : mapping.code ?? (mapping.codeTemplate ? interpolateCodeTemplate(mapping.codeTemplate, typedRow) : undefined),
        description: interpolateDescription(mapping.descriptionTemplate, typedRow),
        quantity,
        unit: mapping.unit,
        unitPrice: mapping.unitPrice ?? null,
        amount: calculateAmount(quantity, mapping.unitPrice ?? null),
        metadata: buildBillableMetadata({
          displayGroup: mapping.displayGroup ?? mapping.category,
          repeater: mapping.repeater,
          assetId: typedRow.assetId ?? null,
          assetTag: typedRow.assetTag ?? null,
          location: typedRow.location ?? null
        }, typedRow, mapping.metadataFields)
      });
    }
  }

  return extracted;
}

export function extractBillableItemsFromFinalizedReport(input: {
  tenantId: string;
  inspectionId: string;
  reportId: string;
  reportType: InspectionType;
  contentJson: JsonValue | null;
}) {
  const parsed = reportDraftSchema.safeParse(input.contentJson ?? {});
  if (!parsed.success) {
    return [] as BillableItem[];
  }

  return extractBillableItemsFromDraft({
    tenantId: input.tenantId,
    inspectionId: input.inspectionId,
    reportId: input.reportId,
    reportType: input.reportType,
    draft: parsed.data
  });
}

export function mergeBillingItems(existingItems: BillableItem[], nextItems: BillableItem[]) {
  const existingById = new Map(existingItems.map((item) => [item.id, item] as const));

  return nextItems.map((item) => {
    const existing = existingById.get(item.id);
    const sourceQuantity = item.quantity;
    const existingSourceQuantity = typeof existing?.metadata?.sourceQuantity === "number" ? existing.metadata.sourceQuantity : undefined;
    const quantity = existing && existingSourceQuantity !== undefined && existing.quantity !== existingSourceQuantity
      ? existing.quantity
      : item.quantity;
    const unitPrice = existing?.unitPrice ?? item.unitPrice ?? null;

    return {
      ...item,
      quantity,
      unitPrice,
      amount: calculateAmount(quantity, unitPrice),
      metadata: {
        ...(item.metadata ?? {}),
        sourceQuantity
      }
    };
  });
}

export function groupBillableItems(items: BillableItem[]) {
  return {
    labor: items.filter((item) => item.category === "labor"),
    material: items.filter((item) => item.category === "material"),
    service: items.filter((item) => item.category === "service"),
    fee: items.filter((item) => item.category === "fee")
  };
}

async function findStoredBillingItemCatalogMatch(tenantId: string, item: BillableItem) {
  return prisma.billingItemCatalogMatch.findUnique({
    where: {
      tenantId_sourceKey: {
        tenantId,
        sourceKey: buildBillingItemSourceKey(item)
      }
    },
    select: {
      sourceKey: true,
      catalogItemId: true,
      confidence: true,
      matchMethod: true,
      catalogItem: {
        select: {
          id: true,
          quickbooksItemId: true,
          name: true,
          sku: true,
          itemType: true,
          unitPrice: true
        }
      }
    }
  }) as Promise<BillingItemCatalogMatchRecord | null>;
}

async function searchCatalogCandidates(
  tenantId: string,
  item: Pick<BillableItem, "code" | "description">,
  query: string,
  options?: { page?: number; limit?: number }
) {
  const rawQuery = query.trim();
  const normalizedQuery = normalizeMatchText(rawQuery);
  const tokenizedQuery = tokenizeMatchText(rawQuery);
  const page = Math.max(options?.page ?? 1, 1);
  const limit = Math.min(Math.max(options?.limit ?? 8, 1), 20);

  if (!rawQuery) {
    return {
      results: [] as BillingCatalogMatchSuggestion[],
      pagination: {
        page: 1,
        totalPages: 1,
        totalCount: 0,
        limit
      }
    };
  }

  const [catalogItems, aliases] = await Promise.all([
    prisma.quickBooksCatalogItem.findMany({
      where: {
        tenantId,
        active: true,
        OR: [
          { name: { contains: rawQuery, mode: "insensitive" } },
          ...(tokenizedQuery.length > 0
            ? tokenizedQuery.map((token) => ({
                name: { contains: token, mode: "insensitive" as const }
              }))
            : []),
          ...(rawQuery ? [{ sku: { contains: rawQuery, mode: "insensitive" as const } }] : [])
        ]
      },
      select: {
        id: true,
        quickbooksItemId: true,
        name: true,
        sku: true,
        itemType: true,
        unitPrice: true
      },
      take: 30
    }),
    prisma.quickBooksCatalogItemAlias.findMany({
      where: {
        tenantId,
        OR: [
          { alias: { contains: rawQuery, mode: "insensitive" } },
          ...(normalizedQuery ? [{ normalizedAlias: { contains: normalizedQuery } }] : [])
        ]
      },
      select: {
        alias: true,
        catalogItem: {
          select: {
            id: true,
            quickbooksItemId: true,
            name: true,
            sku: true,
            itemType: true,
            unitPrice: true
          }
        }
      },
      take: 30
    })
  ]);

  const candidates = new Map<string, BillingCatalogMatchSuggestion>();

  for (const catalogItem of catalogItems) {
    const scored = scoreCatalogMatch({
      item,
      catalogName: catalogItem.name,
      sku: catalogItem.sku
    });
    if (scored.confidence < SUGGESTED_MATCH_CONFIDENCE_THRESHOLD) {
      continue;
    }

    const existing = candidates.get(catalogItem.id);
    if (!existing || scored.confidence > existing.confidence) {
      candidates.set(catalogItem.id, {
        catalogItemId: catalogItem.id,
        quickbooksItemId: catalogItem.quickbooksItemId,
        name: catalogItem.name,
        sku: catalogItem.sku,
        itemType: catalogItem.itemType,
        unitPrice: catalogItem.unitPrice,
        alias: null,
        confidence: scored.confidence,
        matchMethod: scored.matchMethod,
        autoMatchEligible: scored.confidence >= AUTO_MATCH_CONFIDENCE_THRESHOLD
      });
    }
  }

  for (const alias of aliases) {
    const scored = scoreCatalogMatch({
      item,
      catalogName: alias.catalogItem.name,
      alias: alias.alias,
      sku: alias.catalogItem.sku
    });
    if (scored.confidence < SUGGESTED_MATCH_CONFIDENCE_THRESHOLD) {
      continue;
    }

    const existing = candidates.get(alias.catalogItem.id);
    if (!existing || scored.confidence > existing.confidence) {
      candidates.set(alias.catalogItem.id, {
        catalogItemId: alias.catalogItem.id,
        quickbooksItemId: alias.catalogItem.quickbooksItemId,
        name: alias.catalogItem.name,
        sku: alias.catalogItem.sku,
        itemType: alias.catalogItem.itemType,
        unitPrice: alias.catalogItem.unitPrice,
        alias: alias.alias,
        confidence: scored.confidence,
        matchMethod: scored.matchMethod,
        autoMatchEligible: scored.confidence >= AUTO_MATCH_CONFIDENCE_THRESHOLD
      });
    }
  }

  const sorted = [...candidates.values()].sort((left, right) => {
    if (right.confidence !== left.confidence) {
      return right.confidence - left.confidence;
    }

    return left.name.localeCompare(right.name);
  });

  const totalCount = sorted.length;
  const totalPages = Math.max(Math.ceil(totalCount / limit), 1);
  const safePage = Math.min(page, totalPages);
  const results = sorted.slice((safePage - 1) * limit, safePage * limit);

  return {
    results,
    pagination: {
      page: safePage,
      totalPages,
      totalCount,
      limit
    }
  };
}

async function buildBillingItemCatalogState(tenantId: string, item: BillableItem) {
  const linkedCatalogItemId = item.linkedCatalogItemId ?? null;

  if (linkedCatalogItemId) {
    const linkedItem = await prisma.quickBooksCatalogItem.findFirst({
      where: {
        id: linkedCatalogItemId,
        tenantId
      },
      select: {
        id: true,
        quickbooksItemId: true,
        name: true,
        sku: true,
        itemType: true,
        unitPrice: true
      }
    });

    if (linkedItem) {
      return {
        currentMatch: {
          catalogItemId: linkedItem.id,
          quickbooksItemId: linkedItem.quickbooksItemId,
          name: linkedItem.name,
          sku: linkedItem.sku,
          itemType: linkedItem.itemType,
          unitPrice: linkedItem.unitPrice,
          alias: null,
          confidence: item.linkedMatchConfidence ?? 1,
          matchMethod: (item.linkedMatchMethod as BillingCatalogMatchMethod | null) ?? "manual",
          autoMatchEligible: false
        },
        suggestedMatches: [] as BillingCatalogMatchSuggestion[]
      };
    }
  }

  const storedMatch = await findStoredBillingItemCatalogMatch(tenantId, item);
  if (storedMatch) {
    return {
      currentMatch: {
        catalogItemId: storedMatch.catalogItem.id,
        quickbooksItemId: storedMatch.catalogItem.quickbooksItemId,
        name: storedMatch.catalogItem.name,
        sku: storedMatch.catalogItem.sku,
        itemType: storedMatch.catalogItem.itemType,
        unitPrice: storedMatch.catalogItem.unitPrice,
        alias: null,
        confidence: storedMatch.confidence,
        matchMethod: "source_mapping" as const,
        autoMatchEligible: true
      },
      suggestedMatches: [] as BillingCatalogMatchSuggestion[]
    };
  }

  const suggestions = await searchCatalogCandidates(
    tenantId,
    item,
    buildBillingItemSearchQuery(item),
    { page: 1, limit: 3 }
  );

  const highConfidenceSuggestion = suggestions.results[0];
  if (highConfidenceSuggestion?.autoMatchEligible) {
    return {
      currentMatch: highConfidenceSuggestion,
      suggestedMatches: suggestions.results.slice(1)
    };
  }

  return {
    currentMatch: null,
    suggestedMatches: suggestions.results
  };
}

async function buildInspectionServiceFeeItemTx(tx: TransactionClient, input: {
  tenantId: string;
  inspectionId: string;
}) {
  const resolvedFee = await resolveInspectionServiceFeeTx(tx, input);

  return {
    id: `${input.inspectionId}:service-fee`,
    tenantId: input.tenantId,
    inspectionId: input.inspectionId,
    reportId: input.inspectionId,
    reportType: INSPECTION_LEVEL_REPORT_TYPE,
    sourceSection: "service-fee",
    sourceField: "serviceFee",
    category: "fee" as const,
    code: resolvedFee.code,
    description: "Service Fee",
    quantity: 1,
    unit: "inspection",
    unitPrice: resolvedFee.unitPrice,
    amount: calculateAmount(1, resolvedFee.unitPrice),
    metadata: {
      displayGroup: "fee",
      resolutionSource: resolvedFee.source,
      serviceFeeRuleId: resolvedFee.ruleId ?? null,
      serviceFeePriority: resolvedFee.priority ?? null
    }
  } satisfies BillableItem;
}

function subtotalForItems(items: BillableItem[]) {
  return Number(items.reduce((sum, item) => sum + (item.amount ?? 0), 0).toFixed(2));
}

async function getExistingBillingSummaryRow(tx: TransactionClient, inspectionId: string) {
  const rows = await tx.$queryRaw`
    SELECT "id", "tenantId", "inspectionId", "customerCompanyId", "siteId", "status", "items", "subtotal", "notes", "createdAt", "updatedAt"
    FROM "InspectionBillingSummary"
    WHERE "inspectionId" = ${inspectionId}
    LIMIT 1
  ` as PersistedBillingSummaryRow[];

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    status: row.status as BillingSummaryStatus,
    items: normalizeExistingItems(row.items)
  } satisfies PersistedBillingSummary;
}

export async function syncInspectionBillingSummaryTx(tx: TransactionClient, input: {
  tenantId: string;
  inspectionId: string;
}) {
  const db: TransactionClient = tx;

  const inspectionRows = (await db.$queryRaw`
    SELECT "id" AS "inspectionId", "customerCompanyId", "siteId"
    FROM "Inspection"
    WHERE "id" = ${input.inspectionId} AND "tenantId" = ${input.tenantId}
    LIMIT 1
  `) as InspectionRow[];

  const inspection = inspectionRows[0];
  if (!inspection) {
    throw new Error("Inspection not found for billing summary sync.");
  }

  const reports = (await db.$queryRaw`
    SELECT r."id", r."inspectionId", r."tenantId", r."contentJson", t."inspectionType"
    FROM "InspectionReport" r
    INNER JOIN "InspectionTask" t ON t."id" = r."inspectionTaskId"
    WHERE r."tenantId" = ${input.tenantId}
      AND r."inspectionId" = ${input.inspectionId}
      AND r."status"::text = ${reportStatuses.finalized}
  `) as FinalizedReportRow[];

  const extracted = reports.flatMap((report) =>
    extractBillableItemsFromFinalizedReport({
      tenantId: input.tenantId,
      inspectionId: input.inspectionId,
      reportId: report.id,
      reportType: report.inspectionType,
      contentJson: report.contentJson
    })
  );

  extracted.push(await buildInspectionServiceFeeItemTx(db, input));

  const existing = await getExistingBillingSummaryRow(db, input.inspectionId);
  if (extracted.length === 0) {
    await db.$executeRaw`
  DELETE FROM "InspectionBillingSummary"
  WHERE "inspectionId" = ${input.inspectionId} AND "tenantId" = ${input.tenantId}
`;
    return null;
  }

  const mergedItems = mergeBillingItems(existing?.items ?? [], extracted);
  const linkedItems = await Promise.all(
    mergedItems.map(async (item) => {
      if (item.linkedCatalogItemId) {
        return item;
      }

      const storedMatch = await findStoredBillingItemCatalogMatch(input.tenantId, item);
      if (!storedMatch) {
        return item;
      }

      return {
        ...item,
        linkedCatalogItemId: storedMatch.catalogItem.id,
        linkedCatalogItemName: storedMatch.catalogItem.name,
        linkedQuickBooksItemId: storedMatch.catalogItem.quickbooksItemId,
        linkedMatchMethod: "source_mapping",
        linkedMatchConfidence: storedMatch.confidence
      } satisfies BillableItem;
    })
  );
  const subtotal = subtotalForItems(linkedItems);

  const summaryId = existing?.id ?? crypto.randomUUID();
  await db.$executeRaw`
    INSERT INTO "InspectionBillingSummary" (
      "id", "tenantId", "inspectionId", "customerCompanyId", "siteId", "status", "items", "subtotal", "notes", "createdAt", "updatedAt"
    ) VALUES (
      ${summaryId},
      ${input.tenantId},
      ${input.inspectionId},
      ${inspection.customerCompanyId},
      ${inspection.siteId},
      ${existing?.status ?? "draft"},
      ${JSON.stringify(linkedItems)}::jsonb,
      ${subtotal},
      ${existing?.notes ?? null},
      NOW(),
      NOW()
    )
    ON CONFLICT ("inspectionId")
    DO UPDATE SET
      "tenantId" = EXCLUDED."tenantId",
      "customerCompanyId" = EXCLUDED."customerCompanyId",
      "siteId" = EXCLUDED."siteId",
      "items" = EXCLUDED."items",
      "subtotal" = EXCLUDED."subtotal",
      "notes" = COALESCE("InspectionBillingSummary"."notes", EXCLUDED."notes"),
      "updatedAt" = NOW()
  `;

  return {
    id: summaryId,
    tenantId: input.tenantId,
    inspectionId: input.inspectionId,
    customerCompanyId: inspection.customerCompanyId,
    siteId: inspection.siteId,
    status: existing?.status ?? "draft",
    items: linkedItems,
    subtotal,
    notes: existing?.notes ?? null,
    createdAt: existing?.createdAt ?? new Date(),
    updatedAt: new Date()
  } satisfies PersistedBillingSummary;
}

function ensureAdmin(parsedActor: ReturnType<typeof parseActor>) {
  if (!isAdminRole(parsedActor.role)) {
    throw new Error("Only administrators can access billing review.");
  }
}

function buildSummaryMetrics(items: BillableItem[]) {
  const grouped = groupBillableItems(items);
  return {
    laborHoursTotal: Number(grouped.labor.reduce((sum, item) => sum + item.quantity, 0).toFixed(2)),
    materialItemCount: grouped.material.length,
    feeCount: grouped.fee.length,
    serviceCount: grouped.service.length,
    missingPriceCount: items.filter((item) => item.unitPrice === null || item.unitPrice === undefined).length
  };
}

export async function getAdminBillingSummaries(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  ensureAdmin(parsedActor);
  const tenantId = parsedActor.tenantId as string;

  const rows = (await prisma.$queryRaw`
    SELECT
      s."id",
      s."inspectionId",
      s."customerCompanyId",
      c."name" AS "customerName",
      s."siteId",
      site."name" AS "siteName",
      i."scheduledStart" AS "inspectionDate",
      tech."name" AS "technicianName",
      s."status",
      s."quickbooksSyncStatus",
      s."quickbooksInvoiceId",
      s."quickbooksInvoiceNumber",
      s."quickbooksConnectionMode",
      s."quickbooksSyncedAt",
      s."quickbooksSyncError",
      s."subtotal",
      s."notes",
      s."items"
    FROM "InspectionBillingSummary" s
    INNER JOIN "Inspection" i ON i."id" = s."inspectionId"
    INNER JOIN "CustomerCompany" c ON c."id" = s."customerCompanyId"
    INNER JOIN "Site" site ON site."id" = s."siteId"
    LEFT JOIN "User" tech ON tech."id" = i."assignedTechnicianId"
    WHERE s."tenantId" = ${tenantId}
    ORDER BY i."scheduledStart" DESC
  `) as BillingSummaryListRow[];

  return rows.map((row) => {
    const items = normalizeExistingItems((row as unknown as { items: unknown }).items);
    const reportTypes = [...new Set(items.map((item) => item.reportType).filter((reportType) => reportType !== INSPECTION_LEVEL_REPORT_TYPE))];
    return {
      ...row,
      items,
      reportTypes,
      metrics: buildSummaryMetrics(items)
    };
  });
}

export async function getAdminBillingSummaryDetail(actor: ActorContext, inspectionId: string) {
  const parsedActor = parseActor(actor);
  ensureAdmin(parsedActor);
  const tenantId = parsedActor.tenantId as string;

  const rows = (await prisma.$queryRaw`
    SELECT
      s."id",
      s."inspectionId",
      s."customerCompanyId",
      c."name" AS "customerName",
      s."siteId",
      site."name" AS "siteName",
      i."scheduledStart" AS "inspectionDate",
      tech."name" AS "technicianName",
      s."status",
      s."quickbooksSyncStatus",
      s."quickbooksInvoiceId",
      s."quickbooksInvoiceNumber",
      s."quickbooksConnectionMode",
      s."quickbooksSyncedAt",
      s."quickbooksSyncError",
      s."subtotal",
      s."notes",
      s."items"
    FROM "InspectionBillingSummary" s
    INNER JOIN "Inspection" i ON i."id" = s."inspectionId"
    INNER JOIN "CustomerCompany" c ON c."id" = s."customerCompanyId"
    INNER JOIN "Site" site ON site."id" = s."siteId"
    LEFT JOIN "User" tech ON tech."id" = i."assignedTechnicianId"
    WHERE s."tenantId" = ${tenantId} AND s."inspectionId" = ${inspectionId}
    LIMIT 1
  `) as AdminBillingSummaryDetailRow[];

  const row = rows[0];
  if (!row) {
    return null;
  }

  const items = normalizeExistingItems(row.items);
  const itemsWithCatalogState = await Promise.all(
    items.map(async (item) => {
      const catalogState = await buildBillingItemCatalogState(tenantId, item);
      return {
        ...item,
        currentCatalogMatch: catalogState.currentMatch,
        suggestedCatalogMatches: catalogState.suggestedMatches
      };
    })
  );
  return {
    ...row,
    status: row.status as BillingSummaryStatus,
    quickbooksSyncStatus: row.quickbooksSyncStatus ?? "not_synced",
    quickbooksInvoiceId: row.quickbooksInvoiceId ?? null,
    quickbooksInvoiceNumber: row.quickbooksInvoiceNumber ?? null,
    quickbooksConnectionMode: row.quickbooksConnectionMode ?? null,
    quickbooksSyncedAt: row.quickbooksSyncedAt ?? null,
    quickbooksSyncError: row.quickbooksSyncError ?? null,
    items: itemsWithCatalogState,
    groupedItems: groupBillableItems(itemsWithCatalogState),
    reportTypes: [...new Set(itemsWithCatalogState.map((item) => item.reportType).filter((reportType) => reportType !== INSPECTION_LEVEL_REPORT_TYPE))],
    metrics: buildSummaryMetrics(itemsWithCatalogState)
  };
}

async function getAuthorizedBillingSummary(actor: ActorContext, summaryId: string) {
  const parsedActor = parseActor(actor);
  ensureAdmin(parsedActor);

  const rows = (await prisma.$queryRaw`
    SELECT "id", "tenantId", "inspectionId", "status", "subtotal", "notes", "items", "quickbooksSyncStatus", "quickbooksInvoiceId"
    FROM "InspectionBillingSummary"
    WHERE "id" = ${summaryId} AND "tenantId" = ${parsedActor.tenantId as string}
    LIMIT 1
  `) as AuthorizedBillingSummaryRow[];

  const row = rows[0];
  if (!row) {
    throw new Error("Billing summary not found.");
  }

  return {
    parsedActor,
    summary: {
      ...row,
      status: row.status as BillingSummaryStatus,
      items: normalizeExistingItems(row.items)
    }
  };
}

export async function updateBillingSummaryStatus(actor: ActorContext, summaryId: string, status: BillingSummaryStatus) {
  const { summary } = await getAuthorizedBillingSummary(actor, summaryId);
  const resetQuickBooksFields = summary.status === "invoiced" && status !== "invoiced";
  if (resetQuickBooksFields) {
    await prisma.$executeRaw`
      UPDATE "InspectionBillingSummary"
      SET "status" = ${status},
          "quickbooksSyncStatus" = 'not_synced',
          "quickbooksInvoiceId" = NULL,
          "quickbooksInvoiceNumber" = NULL,
          "quickbooksConnectionMode" = NULL,
          "quickbooksCustomerId" = NULL,
          "quickbooksSyncedAt" = NULL,
          "quickbooksSyncError" = NULL,
          "updatedAt" = NOW()
      WHERE "id" = ${summary.id}
    `;
    return;
  }

  await prisma.$executeRaw`
    UPDATE "InspectionBillingSummary"
    SET "status" = ${status}, "updatedAt" = NOW()
    WHERE "id" = ${summary.id}
  `;
}

export async function updateBillingSummaryNotes(actor: ActorContext, summaryId: string, notes: string) {
  const { summary } = await getAuthorizedBillingSummary(actor, summaryId);
  if (summary.status === "invoiced") {
    throw new Error("Invoiced billing summaries must be moved back to review before editing notes.");
  }
  await prisma.$executeRaw`
    UPDATE "InspectionBillingSummary"
    SET "notes" = ${notes || null},
        "quickbooksSyncStatus" = CASE WHEN "quickbooksInvoiceId" IS NULL THEN COALESCE("quickbooksSyncStatus", 'not_synced') ELSE 'not_synced' END,
        "quickbooksInvoiceId" = CASE WHEN "quickbooksInvoiceId" IS NULL THEN "quickbooksInvoiceId" ELSE NULL END,
        "quickbooksInvoiceNumber" = CASE WHEN "quickbooksInvoiceNumber" IS NULL THEN "quickbooksInvoiceNumber" ELSE NULL END,
        "quickbooksConnectionMode" = CASE WHEN "quickbooksInvoiceId" IS NULL THEN "quickbooksConnectionMode" ELSE NULL END,
        "quickbooksCustomerId" = CASE WHEN "quickbooksCustomerId" IS NULL THEN "quickbooksCustomerId" ELSE NULL END,
        "quickbooksSyncedAt" = CASE WHEN "quickbooksSyncedAt" IS NULL THEN "quickbooksSyncedAt" ELSE NULL END,
        "quickbooksSyncError" = NULL,
        "updatedAt" = NOW()
    WHERE "id" = ${summary.id}
  `;
}

export async function updateBillingSummaryItem(actor: ActorContext, summaryId: string, itemId: string, quantity: number, unitPrice: number | null) {
  const { summary } = await getAuthorizedBillingSummary(actor, summaryId);
  if (summary.status === "invoiced") {
    throw new Error("Invoiced billing summaries must be moved back to review before editing line items.");
  }
  const items = summary.items.map((item) => item.id === itemId
    ? {
        ...item,
        quantity,
        unitPrice,
        amount: calculateAmount(quantity, unitPrice)
      }
    : item);
  const subtotal = subtotalForItems(items);

  await prisma.$executeRaw`
    UPDATE "InspectionBillingSummary"
    SET "items" = ${JSON.stringify(items)}::jsonb,
        "subtotal" = ${subtotal},
        "quickbooksSyncStatus" = CASE WHEN "quickbooksInvoiceId" IS NULL THEN COALESCE("quickbooksSyncStatus", 'not_synced') ELSE 'not_synced' END,
        "quickbooksInvoiceId" = CASE WHEN "quickbooksInvoiceId" IS NULL THEN "quickbooksInvoiceId" ELSE NULL END,
        "quickbooksInvoiceNumber" = CASE WHEN "quickbooksInvoiceNumber" IS NULL THEN "quickbooksInvoiceNumber" ELSE NULL END,
        "quickbooksConnectionMode" = CASE WHEN "quickbooksInvoiceId" IS NULL THEN "quickbooksConnectionMode" ELSE NULL END,
        "quickbooksCustomerId" = CASE WHEN "quickbooksCustomerId" IS NULL THEN "quickbooksCustomerId" ELSE NULL END,
        "quickbooksSyncedAt" = CASE WHEN "quickbooksSyncedAt" IS NULL THEN "quickbooksSyncedAt" ELSE NULL END,
        "quickbooksSyncError" = NULL,
        "updatedAt" = NOW()
    WHERE "id" = ${summary.id}
  `;
}

export async function searchBillingSummaryItemCatalogMatches(
  actor: ActorContext,
  input: {
    summaryId: string;
    itemId: string;
    query: string;
    page?: number;
    limit?: number;
  }
) {
  const { parsedActor, summary } = await getAuthorizedBillingSummary(actor, input.summaryId);
  const item = summary.items.find((candidate) => candidate.id === input.itemId);
  if (!item) {
    throw new Error("Billing item not found.");
  }

  return searchCatalogCandidates(parsedActor.tenantId as string, item, input.query, {
    page: input.page,
    limit: input.limit
  });
}

export async function linkBillingSummaryItemCatalog(
  actor: ActorContext,
  input: {
    summaryId: string;
    itemId: string;
    catalogItemId: string;
    saveMapping?: boolean;
    alias?: string | null;
  }
) {
  const { parsedActor, summary } = await getAuthorizedBillingSummary(actor, input.summaryId);
  if (summary.status === "invoiced") {
    throw new Error("Invoiced billing summaries must be moved back to review before linking items.");
  }

  const item = summary.items.find((candidate) => candidate.id === input.itemId);
  if (!item) {
    throw new Error("Billing item not found.");
  }

  const catalogItem = await prisma.quickBooksCatalogItem.findFirst({
    where: {
      id: input.catalogItemId,
      tenantId: parsedActor.tenantId as string
    },
    select: {
      id: true,
      quickbooksItemId: true,
      name: true,
      sku: true,
      unitPrice: true
    }
  });

  if (!catalogItem) {
    throw new Error("Product or service not found.");
  }

  const updatedItems = summary.items.map((candidate) =>
    candidate.id === input.itemId
      ? {
          ...candidate,
          linkedCatalogItemId: catalogItem.id,
          linkedCatalogItemName: catalogItem.name,
          linkedQuickBooksItemId: catalogItem.quickbooksItemId,
          linkedMatchMethod: input.saveMapping ? "manual" : "manual",
          linkedMatchConfidence: 1
        }
      : candidate
  );

  const subtotal = subtotalForItems(updatedItems);

  await prisma.$transaction(async (tx) => {
    await tx.inspectionBillingSummary.update({
      where: { id: summary.id },
      data: {
        items: updatedItems as unknown as Prisma.InputJsonValue,
        subtotal,
        quickbooksSyncStatus: summary.quickbooksInvoiceId ? "not_synced" : summary.quickbooksSyncStatus ?? "not_synced",
        quickbooksInvoiceId: null,
        quickbooksInvoiceNumber: null,
        quickbooksConnectionMode: null,
        quickbooksCustomerId: null,
        quickbooksSyncedAt: null,
        quickbooksSyncError: null
      }
    });

    if (input.saveMapping) {
      await tx.billingItemCatalogMatch.upsert({
        where: {
          tenantId_sourceKey: {
            tenantId: parsedActor.tenantId as string,
            sourceKey: buildBillingItemSourceKey(item)
          }
        },
        update: {
          sourceName: item.description,
          normalizedSourceName: buildNormalizedTokenString(item.description),
          sourceCode: item.code ?? null,
          sourceCategory: item.category,
          sourceReportType: item.reportType,
          sourceSection: item.sourceSection ?? null,
          sourceField: item.sourceField ?? null,
          catalogItemId: catalogItem.id,
          confidence: 1,
          matchMethod: "manual",
          confirmedByUserId: parsedActor.userId,
          confirmedAt: new Date()
        },
        create: {
          tenantId: parsedActor.tenantId as string,
          sourceKey: buildBillingItemSourceKey(item),
          sourceName: item.description,
          normalizedSourceName: buildNormalizedTokenString(item.description),
          sourceCode: item.code ?? null,
          sourceCategory: item.category,
          sourceReportType: item.reportType,
          sourceSection: item.sourceSection ?? null,
          sourceField: item.sourceField ?? null,
          catalogItemId: catalogItem.id,
          confidence: 1,
          matchMethod: "manual",
          confirmedByUserId: parsedActor.userId,
          confirmedAt: new Date()
        }
      });

      const aliasValue = (input.alias?.trim() || item.description.trim());
      const normalizedAlias = buildNormalizedTokenString(aliasValue);
      if (normalizedAlias) {
        await tx.quickBooksCatalogItemAlias.upsert({
          where: {
            tenantId_normalizedAlias: {
              tenantId: parsedActor.tenantId as string,
              normalizedAlias
            }
          },
          update: {
            alias: aliasValue,
            catalogItemId: catalogItem.id,
            createdByUserId: parsedActor.userId
          },
          create: {
            tenantId: parsedActor.tenantId as string,
            catalogItemId: catalogItem.id,
            alias: aliasValue,
            normalizedAlias,
            createdByUserId: parsedActor.userId
          }
        });
      }
    }

    await tx.auditLog.create({
      data: {
        tenantId: parsedActor.tenantId as string,
        actorUserId: parsedActor.userId,
        action: "billing.item_catalog_linked",
        entityType: "InspectionBillingSummary",
        entityId: summary.id,
        metadata: {
          itemId: item.id,
          itemDescription: item.description,
          sourceKey: buildBillingItemSourceKey(item),
          catalogItemId: catalogItem.id,
          catalogItemName: catalogItem.name,
          saveMapping: Boolean(input.saveMapping)
        }
      }
    });
  });

  return {
    catalogItemId: catalogItem.id,
    catalogItemName: catalogItem.name
  };
}

export async function clearBillingSummaryItemCatalogLink(
  actor: ActorContext,
  input: {
    summaryId: string;
    itemId: string;
  }
) {
  const { parsedActor, summary } = await getAuthorizedBillingSummary(actor, input.summaryId);
  if (summary.status === "invoiced") {
    throw new Error("Invoiced billing summaries must be moved back to review before clearing links.");
  }

  const item = summary.items.find((candidate) => candidate.id === input.itemId);
  if (!item) {
    throw new Error("Billing item not found.");
  }

  const updatedItems = summary.items.map((candidate) =>
    candidate.id === input.itemId
      ? {
          ...candidate,
          linkedCatalogItemId: null,
          linkedCatalogItemName: null,
          linkedQuickBooksItemId: null,
          linkedMatchMethod: null,
          linkedMatchConfidence: null
        }
      : candidate
  );

  await prisma.inspectionBillingSummary.update({
    where: { id: summary.id },
    data: {
      items: updatedItems as unknown as Prisma.InputJsonValue,
      subtotal: subtotalForItems(updatedItems),
      quickbooksSyncStatus: summary.quickbooksInvoiceId ? "not_synced" : summary.quickbooksSyncStatus ?? "not_synced",
      quickbooksInvoiceId: null,
      quickbooksInvoiceNumber: null,
      quickbooksConnectionMode: null,
      quickbooksCustomerId: null,
      quickbooksSyncedAt: null,
      quickbooksSyncError: null
    }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "billing.item_catalog_link_cleared",
      entityType: "InspectionBillingSummary",
      entityId: summary.id,
      metadata: {
        itemId: item.id,
        itemDescription: item.description,
        sourceKey: buildBillingItemSourceKey(item)
      }
    }
  });
}
