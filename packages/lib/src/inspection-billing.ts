import { InspectionStatus, Prisma } from "@prisma/client";
import { prisma } from "@testworx/db";

import type { ActorContext, InspectionType, ReportStatus } from "@testworx/types";
import { actorContextSchema, reportStatuses } from "@testworx/types";

import type { JsonValue } from "./json-types";
import type { BillableCategory, BillableFieldMapping, BillableRepeaterMapping } from "./report-config";
import { resolveReportTemplate } from "./report-config";
import { assertTenantContext } from "./permissions";
import { reportDraftSchema, type ReportDraft, type ReportPrimitiveValue } from "./report-engine";
import { runCalculation } from "./report-calculations";
import {
  mapInspectionTypeToComplianceReportingDivision,
  resolveComplianceReportingFeeTx
} from "./compliance-reporting-fees";
import { resolveInspectionServiceFeeTx } from "./service-fees";
import { saveQuickBooksItemMappingForCode } from "./quickbooks";
import { syncInspectionArchiveStateTx } from "./inspection-archive";

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

export type BillingReviewGroup<T extends BillableItem = BillableItem> = T & {
  itemIds: string[];
  sourceItemCount: number;
  sourceItems: T[];
  subtotal: number;
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
const MANUAL_SEARCH_CONFIDENCE_THRESHOLD = 0;

function isRuleControlledFeeItem(item: BillableItem) {
  return item.category === "fee";
}

export type BillingSummaryStatus = "draft" | "reviewed" | "invoiced";

type PersistedBillingSummary = {
  id: string;
  tenantId: string;
  inspectionId: string;
  customerCompanyId: string;
  siteId: string;
  status: BillingSummaryStatus;
  billingType: "standard" | "third_party";
  payerType: "customer" | "provider";
  payerCustomerId: string | null;
  payerProviderAccountId: string | null;
  billingResolutionSnapshotId: string | null;
  billToAccountId: string | null;
  billToName: string | null;
  contractProfileId: string | null;
  contractProfileName: string | null;
  routingSnapshot: JsonValue | null;
  pricingSnapshot: JsonValue | null;
  groupingSnapshot: JsonValue | null;
  attachmentSnapshot: JsonValue | null;
  deliverySnapshot: JsonValue | null;
  referenceSnapshot: JsonValue | null;
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
  billingType: string;
  payerType: string;
  payerCustomerId: string | null;
  payerProviderAccountId: string | null;
  billingResolutionSnapshotId: string | null;
  billToAccountId: string | null;
  billToName: string | null;
  contractProfileId: string | null;
  contractProfileName: string | null;
  routingSnapshot: JsonValue | null;
  pricingSnapshot: JsonValue | null;
  groupingSnapshot: JsonValue | null;
  attachmentSnapshot: JsonValue | null;
  deliverySnapshot: JsonValue | null;
  referenceSnapshot: JsonValue | null;
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
  billingType: "standard" | "third_party";
  billToAccountId: string | null;
  billToName: string | null;
  contractProfileId: string | null;
  contractProfileName: string | null;
  routingSnapshot: JsonValue | null;
  pricingSnapshot: JsonValue | null;
  groupingSnapshot: JsonValue | null;
  attachmentSnapshot: JsonValue | null;
  deliverySnapshot: JsonValue | null;
  referenceSnapshot: JsonValue | null;
  quickbooksSyncStatus: string | null;
  quickbooksInvoiceId: string | null;
  quickbooksInvoiceNumber: string | null;
  quickbooksConnectionMode: string | null;
  quickbooksSyncedAt: Date | null;
  quickbooksSendStatus: string | null;
  quickbooksSentAt: Date | null;
  quickbooksSyncError: string | null;
  quickbooksSendError: string | null;
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
  billingType: string;
  billToAccountId: string | null;
  billToName: string | null;
  contractProfileId: string | null;
  contractProfileName: string | null;
  routingSnapshot: JsonValue | null;
  pricingSnapshot: JsonValue | null;
  groupingSnapshot: JsonValue | null;
  attachmentSnapshot: JsonValue | null;
  deliverySnapshot: JsonValue | null;
  referenceSnapshot: JsonValue | null;
  quickbooksSyncStatus: string | null;
  quickbooksInvoiceId: string | null;
  quickbooksInvoiceNumber: string | null;
  quickbooksConnectionMode: string | null;
  quickbooksSyncedAt: Date | null;
  quickbooksSendStatus: string | null;
  quickbooksSentAt: Date | null;
  quickbooksSyncError: string | null;
  quickbooksSendError: string | null;
  subtotal: number;
  notes: string | null;
  items: JsonValue;
};

type AuthorizedBillingSummaryRow = {
  id: string;
  tenantId: string;
  inspectionId: string;
  status: string;
  billingType: string;
  billToAccountId: string | null;
  billToName: string | null;
  contractProfileId: string | null;
  contractProfileName: string | null;
  routingSnapshot: JsonValue | null;
  pricingSnapshot: JsonValue | null;
  groupingSnapshot: JsonValue | null;
  attachmentSnapshot: JsonValue | null;
  deliverySnapshot: JsonValue | null;
  referenceSnapshot: JsonValue | null;
  subtotal: number;
  notes: string | null;
  items: JsonValue;
  quickbooksSyncStatus: string | null;
  quickbooksInvoiceId: string | null;
  quickbooksSendStatus: string | null;
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
  inspectionClassification: string | null;
};

type InspectionBillingResolutionContext = {
  inspectionId: string;
  customerCompanyId: string;
  customerCompanyName: string;
  customerQuickbooksCustomerId: string | null;
  customerBillingEmail: string | null;
  sourceType: "direct" | "third_party_provider";
  providerContext:
    | {
        id: string;
        providerAccountId: string | null;
        providerContractProfileId: string | null;
        siteProviderAssignmentId: string | null;
        providerWorkOrderNumber: string | null;
        providerReferenceNumber: string | null;
        sourceType: "direct" | "third_party_provider";
        providerAccount: {
          id: string;
          name: string;
          status: "active" | "inactive";
        } | null;
        providerContractProfile: {
          id: string;
          name: string;
          status: "draft" | "active" | "inactive" | "expired";
          invoiceGroupingMode: "per_work_order" | "per_site" | "monthly_rollup";
          requireProviderWorkOrderNumber: boolean;
          requireSiteReferenceNumber: boolean;
          effectiveStartDate: Date | null;
          effectiveEndDate: Date | null;
        } | null;
        siteProviderAssignment: {
          id: string;
          providerContractProfileId: string | null;
          externalAccountName: string | null;
          externalAccountNumber: string | null;
          externalLocationCode: string | null;
        } | null;
      }
    | null;
};

type BillingResolutionResult = {
  billingType: "standard" | "third_party";
  payerType: "customer" | "provider";
  payerCustomerId: string | null;
  payerProviderAccountId: string | null;
  billToAccountId: string | null;
  billToName: string;
  contractProfileId: string | null;
  contractProfileName: string | null;
  routingSnapshot: JsonValue;
  pricingSnapshot: JsonValue;
  groupingSnapshot: JsonValue;
  attachmentSnapshot: JsonValue;
  deliverySnapshot: JsonValue;
  referenceSnapshot: JsonValue;
  resolutionSnapshot: {
    resolvedMode: "direct_customer" | "contract_provider";
    pricingSource: "provider_contract_rate" | "customer_pricing" | "default_pricing" | "manual_override";
    pricingSourceReferenceId: string | null;
    providerContractProfileId: string | null;
    siteProviderAssignmentId: string | null;
    payerCustomerId: string | null;
    payerProviderAccountId: string | null;
    resolutionReason: string;
    snapshotData: string;
  };
  items: BillableItem[];
};

const INSPECTION_LEVEL_REPORT_TYPE = "inspection";
const COMPLIANCE_FEE_REPORT_TYPE = "compliance_reporting";

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

function buildBillingReviewGroupKey(item: Pick<
  BillableItem,
  "category" | "description" | "linkedCatalogItemId" | "linkedQuickBooksItemId" | "linkedCatalogItemName" | "unitPrice" | "unit" | "code"
>) {
  return [
    item.category,
    normalizeMatchText(item.description),
    normalizeMatchText(item.code ?? ""),
    item.linkedCatalogItemId ?? "no_catalog",
    item.linkedQuickBooksItemId ?? "no_qb",
    normalizeMatchText(item.linkedCatalogItemName ?? ""),
    item.unit ?? "no_unit",
    item.unitPrice === null || item.unitPrice === undefined ? "no_price" : item.unitPrice.toFixed(2)
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

function resolveCalculatedSectionFieldValue(
  draft: ReportDraft,
  sourceSectionId: string | undefined,
  fieldId: string | undefined,
  reportType: InspectionType
) {
  if (!sourceSectionId || !fieldId) {
    return undefined;
  }

  const template = resolveReportTemplate({ inspectionType: reportType, assets: [] });
  const section = template.sections.find((entry) => entry.id === sourceSectionId);
  const field = section?.fields.find((entry) => entry.id === fieldId);
  const calculation = field?.calculation;
  if (!calculation || field?.type === "repeater") {
    return undefined;
  }

  const sourceSection = ("sourceSectionId" in calculation && calculation.sourceSectionId
    ? draft.sections[calculation.sourceSectionId]
    : draft.sections[sourceSectionId]) ?? null;
  const sourceFields = sourceSection?.fields as Record<string, ReportPrimitiveValue> | undefined;
  const sourceValue = "sourceFieldId" in calculation ? sourceFields?.[calculation.sourceFieldId] : undefined;
  const sourceValues = "sourceFieldIds" in calculation
    ? calculation.sourceFieldIds.map((sourceFieldId) => sourceFields?.[sourceFieldId] ?? null)
    : "sourceFields" in calculation
      ? calculation.sourceFields.map((source) => {
        const sourceSectionFields = draft.sections[source.sectionId ?? sourceSectionId]?.fields as Record<string, ReportPrimitiveValue> | undefined;
        return sourceSectionFields?.[source.fieldId] ?? null;
      })
      : undefined;

  return runCalculation(calculation.key, {
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

function resolveMappedCodeValue(input: {
  mapping: Pick<BillableFieldMapping | BillableRepeaterMapping, "code" | "codeField">;
  sourceSectionId: string | undefined;
  reportType: InspectionType;
  fields: Record<string, ReportPrimitiveValue>;
  draft: ReportDraft;
}) {
  if (!input.mapping.codeField) {
    return input.mapping.code;
  }

  const calculatedValue = resolveCalculatedSectionFieldValue(
    input.draft,
    input.sourceSectionId,
    input.mapping.codeField,
    input.reportType
  );
  if (calculatedValue !== null && calculatedValue !== undefined && calculatedValue !== "") {
    return String(calculatedValue);
  }

  const directValue = input.fields[input.mapping.codeField];
  if (directValue !== null && directValue !== undefined && directValue !== "") {
    return String(directValue);
  }

  return input.mapping.code;
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
      code: resolveMappedCodeValue({
        mapping,
        sourceSectionId: sourceSection,
        reportType: input.reportType,
        fields: descriptionFields,
        draft: input.draft
      }),
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
          code: resolveMappedCodeValue({
            mapping,
            sourceSectionId: sourceSection,
            reportType: input.reportType,
            fields: typedRow,
            draft: input.draft
          }) ?? (mapping.codeTemplate ? interpolateCodeTemplate(mapping.codeTemplate, typedRow) : undefined),
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
              ? resolveMappedCodeValue({
                mapping,
                sourceSectionId: sourceSection,
                reportType: input.reportType,
                fields: interpolationRow,
                draft: input.draft
              }) ?? mapping.staticCodeByValue?.[selectedValue] ?? (mapping.codeTemplate ? interpolateCodeTemplate(mapping.codeTemplate, interpolationRow) : undefined)
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
        code: resolveMappedCodeValue({
          mapping,
          sourceSectionId: sourceSection,
          reportType: input.reportType,
          fields: typedRow,
          draft: input.draft
        }) ?? (mapping.codeTemplate ? interpolateCodeTemplate(mapping.codeTemplate, typedRow) : undefined),
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

export function groupBillingReviewItems<T extends BillableItem>(items: T[]) {
  const categories = groupBillableItems(items);

  const buildGroups = (categoryItems: T[]) => {
    const grouped = new Map<string, BillingReviewGroup<T>>();

    for (const item of categoryItems) {
      const key = buildBillingReviewGroupKey(item);
      const existing = grouped.get(key);

      if (!existing) {
        grouped.set(key, {
          ...item,
          quantity: Number(item.quantity.toFixed(2)),
          amount: calculateAmount(item.quantity, item.unitPrice ?? null),
          subtotal: Number((item.amount ?? calculateAmount(item.quantity, item.unitPrice ?? null) ?? 0).toFixed(2)),
          itemIds: [item.id],
          sourceItemCount: 1,
          sourceItems: [item]
        });
        continue;
      }

      const combinedQuantity = Number((existing.quantity + item.quantity).toFixed(2));
      const nextSourceItems = [...existing.sourceItems, item];
      grouped.set(key, {
        ...existing,
        quantity: combinedQuantity,
        amount: calculateAmount(combinedQuantity, existing.unitPrice ?? null),
        subtotal: Number((existing.subtotal + (item.amount ?? calculateAmount(item.quantity, item.unitPrice ?? null) ?? 0)).toFixed(2)),
        itemIds: [...existing.itemIds, item.id],
        sourceItemCount: existing.sourceItemCount + 1,
        sourceItems: nextSourceItems
      });
    }

    return Array.from(grouped.values());
  };

  return {
    labor: buildGroups(categories.labor as T[]),
    material: buildGroups(categories.material as T[]),
    service: buildGroups(categories.service as T[]),
    fee: buildGroups(categories.fee as T[])
  };
}

function distributeGroupedQuantity(items: BillableItem[], totalQuantity: number) {
  if (items.length === 0) {
    return new Map<string, number>();
  }

  const roundedTotal = Number(totalQuantity.toFixed(2));
  if (items.length === 1) {
    return new Map([[items[0]!.id, roundedTotal]]);
  }

  const currentTotal = items.reduce((sum, item) => sum + item.quantity, 0);
  const nextAssignments = new Map<string, number>();

  if (currentTotal <= 0) {
    const evenQuantity = Number((roundedTotal / items.length).toFixed(2));
    let runningTotal = 0;
    items.forEach((item, index) => {
      const quantity = index === items.length - 1
        ? Number((roundedTotal - runningTotal).toFixed(2))
        : evenQuantity;
      nextAssignments.set(item.id, quantity);
      runningTotal += quantity;
    });
    return nextAssignments;
  }

  let assignedTotal = 0;
  items.forEach((item, index) => {
    const quantity = index === items.length - 1
      ? Number((roundedTotal - assignedTotal).toFixed(2))
      : Number(((item.quantity / currentTotal) * roundedTotal).toFixed(2));
    nextAssignments.set(item.id, quantity);
    assignedTotal += quantity;
  });

  return nextAssignments;
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

async function findStoredQuickBooksCodeMapping(tenantId: string, item: BillableItem) {
  const billingCode = item.code?.trim();
  if (!billingCode) {
    return null;
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { quickbooksRealmId: true }
  });

  if (!tenant?.quickbooksRealmId) {
    return null;
  }

  const mapping = await prisma.quickBooksItemMap.findUnique({
    where: {
      tenantId_integrationId_internalCode: {
        tenantId,
        integrationId: tenant.quickbooksRealmId,
        internalCode: billingCode
      }
    },
    select: {
      qbItemId: true,
      qbItemName: true,
      matchSource: true
    }
  });

  if (!mapping) {
    return null;
  }

  const catalogItem = await prisma.quickBooksCatalogItem.findFirst({
    where: {
      tenantId,
      quickbooksItemId: mapping.qbItemId
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

  if (!catalogItem) {
    return null;
  }

  return {
    catalogItem,
    matchSource: mapping.matchSource
  };
}

async function searchCatalogCandidates(
  tenantId: string,
  item: Pick<BillableItem, "code" | "description">,
  query: string,
  options?: { page?: number; limit?: number; mode?: "manual" | "suggestion" }
) {
  const rawQuery = query.trim();
  const normalizedQuery = normalizeMatchText(rawQuery);
  const tokenizedQuery = tokenizeMatchText(rawQuery);
  const searchTarget = {
    code: rawQuery || item.code,
    description: rawQuery || item.description
  };
  const page = Math.max(options?.page ?? 1, 1);
  const limit = Math.min(Math.max(options?.limit ?? 8, 1), 20);
  const confidenceThreshold =
    options?.mode === "manual" ? MANUAL_SEARCH_CONFIDENCE_THRESHOLD : SUGGESTED_MATCH_CONFIDENCE_THRESHOLD;

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
      item: searchTarget,
      catalogName: catalogItem.name,
      sku: catalogItem.sku
    });
    if (scored.confidence < confidenceThreshold) {
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
      item: searchTarget,
      catalogName: alias.catalogItem.name,
      alias: alias.alias,
      sku: alias.catalogItem.sku
    });
    if (scored.confidence < confidenceThreshold) {
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
  if (isRuleControlledFeeItem(item)) {
    return {
      currentMatch: null,
      suggestedMatches: [] as BillingCatalogMatchSuggestion[]
    };
  }

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

  const storedCodeMapping = await findStoredQuickBooksCodeMapping(tenantId, item);
  if (storedCodeMapping) {
    return {
      currentMatch: {
        catalogItemId: storedCodeMapping.catalogItem.id,
        quickbooksItemId: storedCodeMapping.catalogItem.quickbooksItemId,
        name: storedCodeMapping.catalogItem.name,
        sku: storedCodeMapping.catalogItem.sku,
        itemType: storedCodeMapping.catalogItem.itemType,
        unitPrice: storedCodeMapping.catalogItem.unitPrice,
        alias: null,
        confidence: 1,
        matchMethod: storedCodeMapping.matchSource === "rule" ? "source_mapping" as const : "manual" as const,
        autoMatchEligible: storedCodeMapping.matchSource === "rule"
      },
      suggestedMatches: [] as BillingCatalogMatchSuggestion[]
    };
  }

  const suggestions = await searchCatalogCandidates(
    tenantId,
    item,
    buildBillingItemSearchQuery(item),
    { page: 1, limit: 3, mode: "suggestion" }
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

async function buildComplianceReportingFeeItemsTx(tx: TransactionClient, input: {
  tenantId: string;
  inspectionId: string;
  siteId: string;
  reportTypes: InspectionType[];
}) {
  const feeItems: BillableItem[] = [];
  const processedDivisions = new Set<string>();
  const site = await tx.site.findFirst({
    where: {
      id: input.siteId,
      tenantId: input.tenantId
    },
    select: {
      city: true,
      state: true
    }
  });

  if (!site) {
    throw new Error("Site not found for compliance reporting fee resolution.");
  }

  for (const reportType of input.reportTypes) {
    const division = mapInspectionTypeToComplianceReportingDivision(reportType);
    if (!division || processedDivisions.has(division)) {
      continue;
    }

    processedDivisions.add(division);
    const resolvedFee = await resolveComplianceReportingFeeTx(tx, {
      tenantId: input.tenantId,
      division,
      location: {
        city: site.city,
        state: site.state
      }
    });

    if (!resolvedFee.matched || resolvedFee.feeAmount <= 0) {
      continue;
    }

    feeItems.push({
      id: `${input.inspectionId}:compliance-fee:${division}`,
      tenantId: input.tenantId,
      inspectionId: input.inspectionId,
      reportId: input.inspectionId,
      reportType: COMPLIANCE_FEE_REPORT_TYPE,
      sourceSection: "compliance-reporting-fee",
      sourceField: division,
      category: "fee" as const,
      code: `COMPLIANCE_REPORTING_FEE_${division.toUpperCase()}`,
      description: "Compliance Reporting Fee",
      quantity: 1,
      unit: "jurisdiction",
      unitPrice: resolvedFee.feeAmount,
      amount: calculateAmount(1, resolvedFee.feeAmount),
      metadata: {
        displayGroup: "fee",
        feeType: "compliance_reporting",
        complianceDivision: division,
        complianceRuleId: resolvedFee.ruleId ?? null,
        complianceJurisdictionCity: resolvedFee.city ?? null,
        complianceJurisdictionCounty: resolvedFee.county ?? null,
        complianceJurisdictionState: resolvedFee.state ?? null,
        complianceResolutionSource: resolvedFee.source
      }
    } satisfies BillableItem);
  }

  return feeItems;
}

function subtotalForItems(items: BillableItem[]) {
  return Number(items.reduce((sum, item) => sum + (item.amount ?? 0), 0).toFixed(2));
}

function normalizeBillingType(value: string | null | undefined): "standard" | "third_party" {
  return value === "third_party" ? "third_party" : "standard";
}

function normalizeInvoicePayerType(value: string | null | undefined): "customer" | "provider" {
  return value === "provider" ? "provider" : "customer";
}

function mapProviderGroupingMode(mode: "per_work_order" | "per_site" | "monthly_rollup" | undefined) {
  switch (mode) {
    case "per_site":
      return { mode: "group_by_site", note: "Grouped by assigned provider site." } satisfies JsonValue;
    case "monthly_rollup":
      return { mode: "standard", note: "Monthly provider rollup billing." } satisfies JsonValue;
    case "per_work_order":
    default:
      return { mode: "group_by_inspection", note: "Billed per provider work order." } satisfies JsonValue;
  }
}

function resolvePricingFallback(input: {
  items: BillableItem[];
}): {
  pricingSource: "customer_pricing" | "default_pricing";
  pricingSourceReferenceId: string | null;
  resolutionReason: string;
} {
  const serviceFeeItem = input.items.find((item) => item.sourceSection === "service-fee");
  const serviceFeeMetadata = (serviceFeeItem?.metadata ?? {}) as Record<string, unknown>;
  const serviceFeeResolutionSource = typeof serviceFeeMetadata.resolutionSource === "string"
    ? serviceFeeMetadata.resolutionSource
    : null;
  const serviceFeeRuleId = typeof serviceFeeMetadata.serviceFeeRuleId === "string"
    ? serviceFeeMetadata.serviceFeeRuleId
    : null;

  if (serviceFeeResolutionSource && serviceFeeResolutionSource !== "default") {
    return {
      pricingSource: "customer_pricing",
      pricingSourceReferenceId: serviceFeeRuleId,
      resolutionReason: `Resolved pricing from customer pricing rules via ${serviceFeeResolutionSource}.`
    };
  }

  return {
    pricingSource: "default_pricing",
    pricingSourceReferenceId: null,
    resolutionReason: "Resolved pricing from default pricing because no provider contract or customer-specific pricing rule applied."
  };
}

function scoreProviderContractRateMatch(input: {
  rate: {
    inspectionType: InspectionType | null;
    reportType: string | null;
    assetCategory: string | null;
    priority: number;
    effectiveStartDate: Date | null;
  };
  reportTypes: InspectionType[];
  assetCategories: string[];
}) {
  let specificity = input.rate.priority * 1000;

  if (input.rate.inspectionType && input.reportTypes.includes(input.rate.inspectionType)) {
    specificity += 200;
  }

  if (input.rate.reportType && input.reportTypes.includes(input.rate.reportType as InspectionType)) {
    specificity += 150;
  }

  if (input.rate.assetCategory && input.assetCategories.includes(input.rate.assetCategory)) {
    specificity += 100;
  }

  if (input.rate.effectiveStartDate) {
    specificity += Math.floor(input.rate.effectiveStartDate.getTime() / 1000_000_000);
  }

  return specificity;
}

function applyProviderContractRateToItems(
  items: BillableItem[],
  rate: {
    pricingMethod: "flat_rate" | "per_unit" | "hourly";
    unitRate: number | null;
    flatRate: number | null;
    minimumCharge: number | null;
  }
) {
  if (!items.length) {
    return items;
  }

  let targetIds = new Set<string>();
  if (rate.pricingMethod === "hourly") {
    targetIds = new Set(items.filter((item) => item.category === "labor").map((item) => item.id));
  } else if (rate.pricingMethod === "per_unit") {
    targetIds = new Set(items.filter((item) => item.category !== "fee").map((item) => item.id));
  } else {
    const flatTarget = items.find((item) => item.sourceSection === "service-fee") ?? items[0];
    if (flatTarget) {
      targetIds = new Set([flatTarget.id]);
    }
  }

  if (!targetIds.size) {
    const fallbackTarget = items.find((item) => item.sourceSection === "service-fee") ?? items[0];
    if (fallbackTarget) {
      targetIds = new Set([fallbackTarget.id]);
    }
  }

  const updatedItems = items.map((item) => {
    if (!targetIds.has(item.id)) {
      return item;
    }

    if (rate.pricingMethod === "flat_rate") {
      const unitPrice = rate.flatRate ?? item.unitPrice ?? null;
      return {
        ...item,
        quantity: 1,
        unitPrice,
        amount: calculateAmount(1, unitPrice)
      };
    }

    const unitPrice = rate.unitRate ?? item.unitPrice ?? null;
    return {
      ...item,
      unitPrice,
      amount: calculateAmount(item.quantity, unitPrice)
    };
  });

  if (!rate.minimumCharge || subtotalForItems(updatedItems) >= rate.minimumCharge) {
    return updatedItems;
  }

  const minimumChargeDelta = Number((rate.minimumCharge - subtotalForItems(updatedItems)).toFixed(2));
  const topUpTarget = updatedItems.find((item) => targetIds.has(item.id)) ?? updatedItems[0];
  if (!topUpTarget) {
    return updatedItems;
  }

  return updatedItems.map((item) => {
    if (item.id !== topUpTarget.id) {
      return item;
    }

    const nextAmount = Number(((item.amount ?? 0) + minimumChargeDelta).toFixed(2));
    const nextUnitPrice = item.quantity > 0 ? Number((nextAmount / item.quantity).toFixed(2)) : nextAmount;

    return {
      ...item,
      unitPrice: nextUnitPrice,
      amount: nextAmount
    };
  });
}

async function getInspectionBillingResolutionContextTx(
  tx: TransactionClient,
  input: {
    tenantId: string;
    inspectionId: string;
  }
) {
  const inspection = await tx.inspection.findFirst({
    where: {
      id: input.inspectionId,
      tenantId: input.tenantId
    },
    select: {
      id: true,
      customerCompanyId: true,
      sourceType: true,
      customerCompany: {
        select: {
          id: true,
          name: true,
          quickbooksCustomerId: true,
          billingEmail: true
        }
      },
      providerContextRecord: {
        select: {
          id: true,
          providerAccountId: true,
          providerContractProfileId: true,
          siteProviderAssignmentId: true,
          providerWorkOrderNumber: true,
          providerReferenceNumber: true,
          sourceType: true,
          providerAccount: {
            select: {
              id: true,
              name: true,
              status: true
            }
          },
          providerContractProfile: {
            select: {
              id: true,
              name: true,
              status: true,
              invoiceGroupingMode: true,
              requireProviderWorkOrderNumber: true,
              requireSiteReferenceNumber: true,
              effectiveStartDate: true,
              effectiveEndDate: true
            }
          },
          siteProviderAssignment: {
            select: {
              id: true,
              providerContractProfileId: true,
              externalAccountName: true,
              externalAccountNumber: true,
              externalLocationCode: true
            }
          }
        }
      },
      providerContextSnapshot: {
        select: {
          id: true,
          providerAccountId: true,
          providerContractProfileId: true,
          siteProviderAssignmentId: true,
          providerWorkOrderNumber: true,
          providerReferenceNumber: true,
          sourceType: true,
          providerAccount: {
            select: {
              id: true,
              name: true,
              status: true
            }
          },
          providerContractProfile: {
            select: {
              id: true,
              name: true,
              status: true,
              invoiceGroupingMode: true,
              requireProviderWorkOrderNumber: true,
              requireSiteReferenceNumber: true,
              effectiveStartDate: true,
              effectiveEndDate: true
            }
          },
          siteProviderAssignment: {
            select: {
              id: true,
              providerContractProfileId: true,
              externalAccountName: true,
              externalAccountNumber: true,
              externalLocationCode: true
            }
          }
        }
      }
    }
  });

  if (!inspection) {
    throw new Error("Inspection not found for billing resolution.");
  }

  const customerCompany = inspection.customerCompany ?? await tx.customerCompany.findFirst({
    where: {
      id: inspection.customerCompanyId,
      tenantId: input.tenantId
    },
    select: {
      id: true,
      name: true,
      quickbooksCustomerId: true,
      billingEmail: true
    }
  });

  if (!customerCompany) {
    throw new Error("Customer not found for billing resolution.");
  }

  const providerContext = inspection.providerContextRecord ?? inspection.providerContextSnapshot ?? null;

  return {
    inspectionId: inspection.id,
    customerCompanyId: customerCompany.id,
    customerCompanyName: customerCompany.name,
    customerQuickbooksCustomerId: customerCompany.quickbooksCustomerId ?? null,
    customerBillingEmail: customerCompany.billingEmail ?? null,
    sourceType: inspection.sourceType ?? "direct",
    providerContext
  } satisfies InspectionBillingResolutionContext;
}

async function resolveProviderContractProfileTx(
  tx: TransactionClient,
  input: {
    tenantId: string;
    providerContext: NonNullable<InspectionBillingResolutionContext["providerContext"]>;
    billingDate: Date;
  }
) {
  const directProfile = input.providerContext.providerContractProfile;
  if (
    directProfile
    && directProfile.status === "active"
    && (!directProfile.effectiveStartDate || directProfile.effectiveStartDate.getTime() <= input.billingDate.getTime())
    && (!directProfile.effectiveEndDate || directProfile.effectiveEndDate.getTime() >= input.billingDate.getTime())
  ) {
    return directProfile;
  }

  const profileId = input.providerContext.providerContractProfileId
    ?? input.providerContext.siteProviderAssignment?.providerContractProfileId
    ?? null;

  if (profileId) {
    const profile = await tx.providerContractProfile.findFirst({
    where: {
      id: profileId,
      organizationId: input.tenantId,
      status: "active",
      effectiveStartDate: { lte: input.billingDate },
      AND: [
        {
          OR: [
              { effectiveEndDate: null },
              { effectiveEndDate: { gte: input.billingDate } }
            ]
          }
        ]
      },
      select: {
        id: true,
        name: true,
        status: true,
        invoiceGroupingMode: true,
        requireProviderWorkOrderNumber: true,
        requireSiteReferenceNumber: true,
        effectiveStartDate: true,
        effectiveEndDate: true
      }
    });

    if (profile) {
      return profile;
    }
  }

  if (!input.providerContext.providerAccountId) {
    throw new Error("Third-party provider work orders require a provider account.");
  }

  const fallbackProfile = await tx.providerContractProfile.findFirst({
    where: {
      organizationId: input.tenantId,
      providerAccountId: input.providerContext.providerAccountId,
      status: "active",
      effectiveStartDate: { lte: input.billingDate },
      AND: [
        {
          OR: [
            { effectiveEndDate: null },
            { effectiveEndDate: { gte: input.billingDate } }
          ]
        }
      ]
    },
    orderBy: [
      { effectiveStartDate: "desc" },
      { createdAt: "desc" }
    ],
    select: {
      id: true,
      name: true,
      status: true,
      invoiceGroupingMode: true,
      requireProviderWorkOrderNumber: true,
      requireSiteReferenceNumber: true,
      effectiveStartDate: true,
      effectiveEndDate: true
    }
  });

  if (!fallbackProfile) {
    throw new Error("Third-party provider work orders require an active provider contract profile.");
  }

  return fallbackProfile;
}

async function resolveProviderContractRateTx(
  tx: TransactionClient,
  input: {
    providerContractProfileId: string;
    billingDate: Date;
    serviceType: string;
    reportTypes: InspectionType[];
    items: BillableItem[];
  }
) {
  const assetCategories = [
    ...new Set(
      input.items
        .map((item) => {
          const metadata = (item.metadata ?? {}) as Record<string, unknown>;
          return typeof metadata.assetCategory === "string" ? metadata.assetCategory : null;
        })
        .filter((value): value is string => Boolean(value))
    )
  ];

  const rates = await tx.providerContractRate.findMany({
    where: {
      providerContractProfileId: input.providerContractProfileId,
      serviceType: input.serviceType
    },
    select: {
      id: true,
      inspectionType: true,
      reportType: true,
      assetCategory: true,
      pricingMethod: true,
      unitRate: true,
      flatRate: true,
      minimumCharge: true,
      effectiveStartDate: true,
      effectiveEndDate: true,
      priority: true
    }
  });

  return rates
    .filter((rate) => !rate.effectiveStartDate || rate.effectiveStartDate.getTime() <= input.billingDate.getTime())
    .filter((rate) => !rate.effectiveEndDate || rate.effectiveEndDate.getTime() >= input.billingDate.getTime())
    .filter((rate) => !rate.inspectionType || input.reportTypes.includes(rate.inspectionType))
    .filter((rate) => !rate.reportType || input.reportTypes.includes(rate.reportType as InspectionType))
    .filter((rate) => !rate.assetCategory || assetCategories.includes(rate.assetCategory))
    .sort((left, right) =>
      scoreProviderContractRateMatch({ rate: right, reportTypes: input.reportTypes, assetCategories })
      - scoreProviderContractRateMatch({ rate: left, reportTypes: input.reportTypes, assetCategories })
    )[0] ?? null;
}

async function resolveBillingOutcomeTx(
  tx: TransactionClient,
  input: {
    tenantId: string;
    inspectionId: string;
    inspectionClassification: string | null;
    reportTypes: InspectionType[];
    items: BillableItem[];
  }
): Promise<BillingResolutionResult> {
  const inspection = await getInspectionBillingResolutionContextTx(tx, {
    tenantId: input.tenantId,
    inspectionId: input.inspectionId
  });
  const billingDate = new Date();
  const hasDeficiencyWork = input.reportTypes.includes("work_order");
  const hasServiceWork = input.items.some((item) => item.category === "labor" || item.category === "service");
  const serviceType = input.inspectionClassification === "emergency"
    ? "emergency"
    : hasDeficiencyWork
      ? "deficiency"
      : hasServiceWork
        ? "service"
        : "inspection";

  if (inspection.providerContext) {
    const providerAccount = inspection.providerContext.providerAccount;
    const providerAccountId = inspection.providerContext.providerAccountId ?? providerAccount?.id ?? null;
    if (!providerAccountId || !providerAccount || providerAccount.status !== "active") {
      throw new Error("Third-party provider work orders require an active provider account.");
    }

    const contractProfile = await resolveProviderContractProfileTx(tx, {
      tenantId: input.tenantId,
      providerContext: inspection.providerContext,
      billingDate
    });
    const providerRate = await resolveProviderContractRateTx(tx, {
      providerContractProfileId: contractProfile.id,
      billingDate,
      serviceType,
      reportTypes: input.reportTypes,
      items: input.items
    });
    const fallbackPricing = resolvePricingFallback({ items: input.items });
    const pricedItems = providerRate ? applyProviderContractRateToItems(input.items, providerRate) : input.items;
    const pricingSource = providerRate ? "provider_contract_rate" : fallbackPricing.pricingSource;
    const pricingSourceReferenceId = providerRate ? providerRate.id : fallbackPricing.pricingSourceReferenceId;
    const resolutionReason = providerRate
      ? `Resolved to contract provider billing for ${providerAccount.name} using contract rate ${providerRate.id}.`
      : `Resolved to contract provider billing for ${providerAccount.name}; ${fallbackPricing.resolutionReason}`;
    const routingSnapshot = {
      billToAccountId: providerAccountId,
      billToName: providerAccount.name,
      quickbooksCustomerId: null,
      autoBillingEnabled: true,
      sourceType: inspection.providerContext.sourceType,
      providerWorkOrderNumber: inspection.providerContext.providerWorkOrderNumber,
      providerReferenceNumber: inspection.providerContext.providerReferenceNumber
    } satisfies JsonValue;
    const pricingSnapshot = {
      source: pricingSource,
      sourceReferenceId: pricingSourceReferenceId,
      serviceType,
      pricingMethod: providerRate?.pricingMethod ?? null,
      providerRateId: providerRate?.id ?? null
    } satisfies JsonValue;
    const groupingSnapshot = mapProviderGroupingMode(contractProfile.invoiceGroupingMode);
    const attachmentSnapshot = {
      requireFinalizedReport: true,
      requireSignedDocument: false,
      requiredDocumentLabels: []
    } satisfies JsonValue;
    const deliverySnapshot = {
      holdForManualReview: true,
      method: "manual",
      recipientEmail: null
    } satisfies JsonValue;
    const referenceLabels = [
      ...(contractProfile.requireProviderWorkOrderNumber ? ["Provider work order number"] : []),
      ...(contractProfile.requireSiteReferenceNumber ? ["Site reference number"] : [])
    ];
    const referenceSnapshot = {
      requirePo: contractProfile.requireProviderWorkOrderNumber,
      requireCustomerReference: contractProfile.requireSiteReferenceNumber,
      labels: referenceLabels
    } satisfies JsonValue;
    const snapshotData = JSON.stringify({
      resolvedMode: "contract_provider",
      payerProviderAccountId: providerAccountId,
      providerContractProfileId: contractProfile.id,
      siteProviderAssignmentId: inspection.providerContext.siteProviderAssignmentId ?? null,
      pricingSource,
      pricingSourceReferenceId,
      resolutionReason,
      routingSnapshot,
      pricingSnapshot
    });

    return {
      billingType: "third_party",
      payerType: "provider",
      payerCustomerId: null,
      payerProviderAccountId: providerAccountId,
      billToAccountId: providerAccountId,
      billToName: providerAccount.name,
      contractProfileId: contractProfile.id,
      contractProfileName: contractProfile.name,
      routingSnapshot,
      pricingSnapshot,
      groupingSnapshot,
      attachmentSnapshot,
      deliverySnapshot,
      referenceSnapshot,
      resolutionSnapshot: {
        resolvedMode: "contract_provider",
        pricingSource,
        pricingSourceReferenceId,
        providerContractProfileId: contractProfile.id,
        siteProviderAssignmentId: inspection.providerContext.siteProviderAssignmentId ?? null,
        payerCustomerId: null,
        payerProviderAccountId: providerAccountId,
        resolutionReason,
        snapshotData
      },
      items: pricedItems
    };
  }

  const fallbackPricing = resolvePricingFallback({ items: input.items });
  const routingSnapshot = {
    billToAccountId: null,
    billToName: inspection.customerCompanyName,
    quickbooksCustomerId: inspection.customerQuickbooksCustomerId,
    autoBillingEnabled: false,
    sourceType: inspection.sourceType
  } satisfies JsonValue;
  const pricingSnapshot = {
    source: fallbackPricing.pricingSource,
    sourceReferenceId: fallbackPricing.pricingSourceReferenceId,
    serviceType
  } satisfies JsonValue;
  const groupingSnapshot = { mode: "standard" } satisfies JsonValue;
  const attachmentSnapshot = {
    requireFinalizedReport: false,
    requireSignedDocument: false,
    requiredDocumentLabels: []
  } satisfies JsonValue;
  const deliverySnapshot = {
    holdForManualReview: false,
    method: inspection.customerBillingEmail ? "customer_email" : "manual",
    recipientEmail: inspection.customerBillingEmail
  } satisfies JsonValue;
  const referenceSnapshot = {
    requirePo: false,
    requireCustomerReference: false,
    labels: []
  } satisfies JsonValue;
  const resolutionReason = `Resolved to direct customer billing; ${fallbackPricing.resolutionReason}`;
  const snapshotData = JSON.stringify({
    resolvedMode: "direct_customer",
    payerCustomerId: inspection.customerCompanyId,
    pricingSource: fallbackPricing.pricingSource,
    pricingSourceReferenceId: fallbackPricing.pricingSourceReferenceId,
    resolutionReason,
    routingSnapshot,
    pricingSnapshot
  });

  return {
    billingType: "standard",
    payerType: "customer",
    payerCustomerId: inspection.customerCompanyId,
    payerProviderAccountId: null,
    billToAccountId: null,
    billToName: inspection.customerCompanyName,
    contractProfileId: null,
    contractProfileName: null,
    routingSnapshot,
    pricingSnapshot,
    groupingSnapshot,
    attachmentSnapshot,
    deliverySnapshot,
    referenceSnapshot,
    resolutionSnapshot: {
      resolvedMode: "direct_customer",
      pricingSource: fallbackPricing.pricingSource,
      pricingSourceReferenceId: fallbackPricing.pricingSourceReferenceId,
      providerContractProfileId: null,
      siteProviderAssignmentId: null,
      payerCustomerId: inspection.customerCompanyId,
      payerProviderAccountId: null,
      resolutionReason,
      snapshotData
    },
    items: input.items
  };
}

async function getExistingBillingSummaryRow(tx: TransactionClient, inspectionId: string) {
  const rows = await tx.$queryRaw`
    SELECT "id", "tenantId", "inspectionId", "customerCompanyId", "siteId", "status", "billingType", "payerType", "payerCustomerId", "payerProviderAccountId", "billingResolutionSnapshotId", "billToAccountId", "billToName", "contractProfileId", "contractProfileName", "routingSnapshot", "pricingSnapshot", "groupingSnapshot", "attachmentSnapshot", "deliverySnapshot", "referenceSnapshot", "items", "subtotal", "notes", "createdAt", "updatedAt"
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
    billingType: normalizeBillingType(row.billingType),
    payerType: normalizeInvoicePayerType(row.payerType),
    items: normalizeExistingItems(row.items)
  } satisfies PersistedBillingSummary;
}

export async function syncInspectionBillingSummaryTx(tx: TransactionClient, input: {
  tenantId: string;
  inspectionId: string;
}) {
  const db: TransactionClient = tx;

  const inspectionRows = (await db.$queryRaw`
    SELECT "id" AS "inspectionId", "customerCompanyId", "siteId", "inspectionClassification"
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
  extracted.push(...await buildComplianceReportingFeeItemsTx(db, {
    tenantId: input.tenantId,
    inspectionId: input.inspectionId,
    siteId: inspection.siteId,
    reportTypes: reports.map((report) => report.inspectionType)
  }));

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
      if (isRuleControlledFeeItem(item)) {
        return {
          ...item,
          linkedCatalogItemId: null,
          linkedCatalogItemName: null,
          linkedQuickBooksItemId: null,
          linkedMatchMethod: null,
          linkedMatchConfidence: null
        } satisfies BillableItem;
      }

      if (item.linkedCatalogItemId) {
        return item;
      }

      const storedMatch = await findStoredBillingItemCatalogMatch(input.tenantId, item);
      if (!storedMatch) {
        return item;
      }

      return {
        ...item,
        unitPrice: item.unitPrice ?? storedMatch.catalogItem.unitPrice ?? null,
        amount: calculateAmount(item.quantity, item.unitPrice ?? storedMatch.catalogItem.unitPrice ?? null),
        linkedCatalogItemId: storedMatch.catalogItem.id,
        linkedCatalogItemName: storedMatch.catalogItem.name,
        linkedQuickBooksItemId: storedMatch.catalogItem.quickbooksItemId,
        linkedMatchMethod: "source_mapping",
        linkedMatchConfidence: storedMatch.confidence
      } satisfies BillableItem;
    })
  );
  const existingResolutionSnapshot = existing?.billingResolutionSnapshotId
    ? await db.billingResolutionSnapshot.findFirst({
        where: {
          id: existing.billingResolutionSnapshotId,
          organizationId: input.tenantId
        },
        select: { id: true }
      })
    : null;
  const existingResolvedSummary = existing && existingResolutionSnapshot
    ? existing
    : null;
  const billingResolution = existingResolvedSummary
    ? {
        billingType: existingResolvedSummary.billingType,
        payerType: existingResolvedSummary.payerType,
        payerCustomerId: existingResolvedSummary.payerCustomerId,
        payerProviderAccountId: existingResolvedSummary.payerProviderAccountId,
        billToAccountId: existingResolvedSummary.billToAccountId,
        billToName: existingResolvedSummary.billToName ?? "Billing Payer",
        contractProfileId: existingResolvedSummary.contractProfileId,
        contractProfileName: existingResolvedSummary.contractProfileName,
        routingSnapshot: existingResolvedSummary.routingSnapshot ?? null,
        pricingSnapshot: existingResolvedSummary.pricingSnapshot ?? null,
        groupingSnapshot: existingResolvedSummary.groupingSnapshot ?? null,
        attachmentSnapshot: existingResolvedSummary.attachmentSnapshot ?? null,
        deliverySnapshot: existingResolvedSummary.deliverySnapshot ?? null,
        referenceSnapshot: existingResolvedSummary.referenceSnapshot ?? null,
        resolutionSnapshot: {
          resolvedMode: (existingResolvedSummary.payerType === "provider"
            ? "contract_provider"
            : "direct_customer") as "contract_provider" | "direct_customer",
          pricingSource: "manual_override" as const,
          pricingSourceReferenceId: null,
          providerContractProfileId: existingResolvedSummary.contractProfileId,
          siteProviderAssignmentId: null,
          payerCustomerId: existingResolvedSummary.payerCustomerId,
          payerProviderAccountId: existingResolvedSummary.payerProviderAccountId,
          resolutionReason: "Reused existing billing resolution snapshot.",
          snapshotData: "{}"
        },
        items: linkedItems
      }
    : await resolveBillingOutcomeTx(db, {
        tenantId: input.tenantId,
        inspectionId: input.inspectionId,
        inspectionClassification: inspection.inspectionClassification,
        reportTypes: reports.map((report) => report.inspectionType),
        items: linkedItems
      });
  const pricedItems = billingResolution.items;
  const subtotal = subtotalForItems(pricedItems);
  const billingResolutionSnapshotId = existingResolutionSnapshot?.id
    ?? (
      await db.billingResolutionSnapshot.create({
        data: {
          organizationId: input.tenantId,
          sourceEntityType: "work_order",
          sourceEntityId: input.inspectionId,
          resolvedMode: billingResolution.resolutionSnapshot.resolvedMode,
          payerCustomerId: billingResolution.resolutionSnapshot.payerCustomerId,
          payerProviderAccountId: billingResolution.resolutionSnapshot.payerProviderAccountId,
          providerContractProfileId: billingResolution.resolutionSnapshot.providerContractProfileId,
          siteProviderAssignmentId: billingResolution.resolutionSnapshot.siteProviderAssignmentId,
          pricingSource: billingResolution.resolutionSnapshot.pricingSource,
          pricingSourceReferenceId: billingResolution.resolutionSnapshot.pricingSourceReferenceId,
          resolutionReason: billingResolution.resolutionSnapshot.resolutionReason,
          snapshotData: billingResolution.resolutionSnapshot.snapshotData
        },
        select: { id: true }
      })
    ).id;

  const summaryId = existing?.id ?? crypto.randomUUID();
  await db.$executeRaw`
    INSERT INTO "InspectionBillingSummary" (
      "id", "tenantId", "inspectionId", "customerCompanyId", "siteId", "status", "billingType", "payerType", "payerCustomerId", "payerProviderAccountId", "billingResolutionSnapshotId", "billToAccountId", "billToName", "contractProfileId", "contractProfileName", "routingSnapshot", "pricingSnapshot", "groupingSnapshot", "attachmentSnapshot", "deliverySnapshot", "referenceSnapshot", "items", "subtotal", "notes", "createdAt", "updatedAt"
    ) VALUES (
      ${summaryId},
      ${input.tenantId},
      ${input.inspectionId},
      ${inspection.customerCompanyId},
      ${inspection.siteId},
      ${existing?.status ?? "draft"},
      ${billingResolution.billingType}::"BillingType",
      ${billingResolution.payerType}::"InvoicePayerType",
      ${billingResolution.payerCustomerId},
      ${billingResolution.payerProviderAccountId},
      ${billingResolutionSnapshotId},
      ${billingResolution.billToAccountId},
      ${billingResolution.billToName},
      ${billingResolution.contractProfileId},
      ${billingResolution.contractProfileName},
      ${JSON.stringify(billingResolution.routingSnapshot)}::jsonb,
      ${JSON.stringify(billingResolution.pricingSnapshot)}::jsonb,
      ${JSON.stringify(billingResolution.groupingSnapshot)}::jsonb,
      ${JSON.stringify(billingResolution.attachmentSnapshot)}::jsonb,
      ${JSON.stringify(billingResolution.deliverySnapshot)}::jsonb,
      ${JSON.stringify(billingResolution.referenceSnapshot)}::jsonb,
      ${JSON.stringify(pricedItems)}::jsonb,
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
      "billingType" = EXCLUDED."billingType",
      "payerType" = EXCLUDED."payerType",
      "payerCustomerId" = EXCLUDED."payerCustomerId",
      "payerProviderAccountId" = EXCLUDED."payerProviderAccountId",
      "billingResolutionSnapshotId" = COALESCE("InspectionBillingSummary"."billingResolutionSnapshotId", EXCLUDED."billingResolutionSnapshotId"),
      "billToAccountId" = EXCLUDED."billToAccountId",
      "billToName" = EXCLUDED."billToName",
      "contractProfileId" = EXCLUDED."contractProfileId",
      "contractProfileName" = EXCLUDED."contractProfileName",
      "routingSnapshot" = EXCLUDED."routingSnapshot",
      "pricingSnapshot" = EXCLUDED."pricingSnapshot",
      "groupingSnapshot" = EXCLUDED."groupingSnapshot",
      "attachmentSnapshot" = EXCLUDED."attachmentSnapshot",
      "deliverySnapshot" = EXCLUDED."deliverySnapshot",
      "referenceSnapshot" = EXCLUDED."referenceSnapshot",
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
    billingType: billingResolution.billingType,
    payerType: billingResolution.payerType,
    payerCustomerId: billingResolution.payerCustomerId,
    payerProviderAccountId: billingResolution.payerProviderAccountId,
    billingResolutionSnapshotId,
    billToAccountId: billingResolution.billToAccountId,
    billToName: billingResolution.billToName,
    contractProfileId: billingResolution.contractProfileId,
    contractProfileName: billingResolution.contractProfileName,
    routingSnapshot: billingResolution.routingSnapshot,
    pricingSnapshot: billingResolution.pricingSnapshot,
    groupingSnapshot: billingResolution.groupingSnapshot,
    attachmentSnapshot: billingResolution.attachmentSnapshot,
    deliverySnapshot: billingResolution.deliverySnapshot,
    referenceSnapshot: billingResolution.referenceSnapshot,
    items: pricedItems,
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
      s."billingType",
      s."billToAccountId",
      s."billToName",
      s."contractProfileId",
      s."contractProfileName",
      s."routingSnapshot",
      s."pricingSnapshot",
      s."groupingSnapshot",
      s."attachmentSnapshot",
      s."deliverySnapshot",
      s."referenceSnapshot",
      s."quickbooksSyncStatus",
      s."quickbooksInvoiceId",
      s."quickbooksInvoiceNumber",
      s."quickbooksConnectionMode",
      s."quickbooksSyncedAt",
      s."quickbooksSendStatus",
      s."quickbooksSentAt",
      s."quickbooksSyncError",
      s."quickbooksSendError",
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

  const existingSummaryRows = (await prisma.$queryRaw`
    SELECT "id", "status"
    FROM "InspectionBillingSummary"
    WHERE "tenantId" = ${tenantId} AND "inspectionId" = ${inspectionId}
    LIMIT 1
  `) as Array<{ id: string; status: string }>;

  const existingSummary = existingSummaryRows[0] ?? null;
  if (existingSummary && existingSummary.status !== "invoiced") {
    try {
      await syncInspectionBillingSummaryTx(prisma as unknown as TransactionClient, {
        tenantId,
        inspectionId
      });
    } catch {
      // Keep billing review usable even if a legacy summary cannot be refreshed cleanly.
    }
  }

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
      s."billingType",
      s."billToAccountId",
      s."billToName",
      s."contractProfileId",
      s."contractProfileName",
      s."routingSnapshot",
      s."pricingSnapshot",
      s."groupingSnapshot",
      s."attachmentSnapshot",
      s."deliverySnapshot",
      s."referenceSnapshot",
      s."quickbooksSyncStatus",
      s."quickbooksInvoiceId",
      s."quickbooksInvoiceNumber",
      s."quickbooksConnectionMode",
      s."quickbooksSyncedAt",
      s."quickbooksSendStatus",
      s."quickbooksSentAt",
      s."quickbooksSyncError",
      s."quickbooksSendError",
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

  const [billingResolutionSnapshot, providerContextRecord] = await Promise.all([
    prisma.inspectionBillingSummary.findFirst({
      where: {
        tenantId,
        inspectionId
      },
      select: {
        billingResolutionSnapshot: {
          include: {
            payerCustomer: { select: { id: true, name: true } },
            payerProviderAccount: { select: { id: true, name: true } },
            providerContractProfile: { select: { id: true, name: true } },
            siteProviderAssignment: {
              include: {
                providerAccount: { select: { id: true, name: true } },
                providerContractProfile: { select: { id: true, name: true } },
                serviceSite: { select: { id: true, name: true } }
              }
            }
          }
        }
      }
    }),
    prisma.workOrderProviderContext.findFirst({
      where: {
        workOrderId: inspectionId
      },
      include: {
        providerAccount: { select: { id: true, name: true } },
        providerContractProfile: { select: { id: true, name: true } },
        siteProviderAssignment: {
          include: {
            serviceSite: { select: { id: true, name: true } }
          }
        }
      }
    })
  ]);

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
    billingType: normalizeBillingType(row.billingType),
    quickbooksSyncStatus: row.quickbooksSyncStatus ?? "not_synced",
    quickbooksInvoiceId: row.quickbooksInvoiceId ?? null,
    quickbooksInvoiceNumber: row.quickbooksInvoiceNumber ?? null,
    quickbooksConnectionMode: row.quickbooksConnectionMode ?? null,
    quickbooksSyncedAt: row.quickbooksSyncedAt ?? null,
    quickbooksSendStatus: row.quickbooksSendStatus ?? (row.quickbooksSyncStatus === "sent" ? "sent" : "not_sent"),
    quickbooksSentAt: row.quickbooksSentAt ?? (row.quickbooksSyncStatus === "sent" ? row.quickbooksSyncedAt ?? null : null),
    quickbooksSyncError: row.quickbooksSyncError ?? null,
    quickbooksSendError: row.quickbooksSendError ?? null,
    items: itemsWithCatalogState,
    groupedItems: groupBillableItems(itemsWithCatalogState),
    reviewGroupedItems: groupBillingReviewItems(itemsWithCatalogState),
    reportTypes: [...new Set(itemsWithCatalogState.map((item) => item.reportType).filter((reportType) => reportType !== INSPECTION_LEVEL_REPORT_TYPE))],
    metrics: buildSummaryMetrics(itemsWithCatalogState),
    billingResolution: billingResolutionSnapshot?.billingResolutionSnapshot ?? null,
    providerContext: providerContextRecord ?? null
  };
}

async function getAuthorizedBillingSummary(actor: ActorContext, summaryId: string) {
  const parsedActor = parseActor(actor);
  ensureAdmin(parsedActor);

  const rows = (await prisma.$queryRaw`
    SELECT "id", "tenantId", "inspectionId", "status", "billingType", "billToAccountId", "billToName", "contractProfileId", "contractProfileName", "routingSnapshot", "pricingSnapshot", "groupingSnapshot", "attachmentSnapshot", "deliverySnapshot", "referenceSnapshot", "subtotal", "notes", "items", "quickbooksSyncStatus", "quickbooksInvoiceId", "quickbooksSendStatus"
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
  const nextInspectionStatus = status === "invoiced"
    ? InspectionStatus.invoiced
    : resetQuickBooksFields
      ? InspectionStatus.completed
      : null;
  if (resetQuickBooksFields) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
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

      if (nextInspectionStatus) {
        await tx.inspection.update({
          where: { id: summary.inspectionId },
          data: nextInspectionStatus === "completed"
            ? { status: nextInspectionStatus, isPriority: false, priorityClearedAt: new Date() }
            : { status: nextInspectionStatus }
        });

        await syncInspectionArchiveStateTx(tx, {
          tenantId: summary.tenantId,
          inspectionId: summary.inspectionId
        });
      }
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      UPDATE "InspectionBillingSummary"
      SET "status" = ${status}, "updatedAt" = NOW()
      WHERE "id" = ${summary.id}
    `;

    if (nextInspectionStatus) {
      await tx.inspection.update({
          where: { id: summary.inspectionId },
          data: nextInspectionStatus === "completed"
            ? { status: nextInspectionStatus, isPriority: false, priorityClearedAt: new Date() }
            : { status: nextInspectionStatus }
        });

      await syncInspectionArchiveStateTx(tx, {
        tenantId: summary.tenantId,
        inspectionId: summary.inspectionId
      });
    }
  });
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

export async function updateBillingSummaryItemGroup(
  actor: ActorContext,
  summaryId: string,
  itemIds: string[],
  quantity: number,
  unitPrice: number | null
) {
  const { summary } = await getAuthorizedBillingSummary(actor, summaryId);
  if (summary.status === "invoiced") {
    throw new Error("Invoiced billing summaries must be moved back to review before editing line items.");
  }

  const uniqueItemIds = [...new Set(itemIds.filter(Boolean))];
  if (!uniqueItemIds.length) {
    throw new Error("Billing item group not found.");
  }

  const groupedItems = summary.items.filter((item) => uniqueItemIds.includes(item.id));
  if (groupedItems.length !== uniqueItemIds.length) {
    throw new Error("Billing item group not found.");
  }

  const firstKey = buildBillingReviewGroupKey(groupedItems[0]!);
  if (groupedItems.some((item) => buildBillingReviewGroupKey(item) !== firstKey)) {
    throw new Error("Only identical billing items can be updated as a grouped row.");
  }

  const quantityAssignments = distributeGroupedQuantity(groupedItems, quantity);
  const updatedItems = summary.items.map((item) => {
    if (!quantityAssignments.has(item.id)) {
      return item;
    }

    const nextQuantity = quantityAssignments.get(item.id) ?? 0;
    return {
      ...item,
      quantity: nextQuantity,
      unitPrice,
      amount: calculateAmount(nextQuantity, unitPrice)
    };
  });
  const subtotal = subtotalForItems(updatedItems);

  await prisma.$executeRaw`
    UPDATE "InspectionBillingSummary"
    SET "items" = ${JSON.stringify(updatedItems)}::jsonb,
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
  if (isRuleControlledFeeItem(item)) {
    throw new Error("Automatic fee pricing is controlled by fee rules and cannot be edited here.");
  }

  return searchCatalogCandidates(parsedActor.tenantId as string, item, input.query, {
    page: input.page,
    limit: input.limit,
    mode: "manual"
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
  if (isRuleControlledFeeItem(item)) {
    throw new Error("Automatic fee pricing is controlled by fee rules and cannot be edited here.");
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
          unitPrice: catalogItem.unitPrice ?? null,
          amount: calculateAmount(candidate.quantity, catalogItem.unitPrice ?? null),
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
        quickbooksSyncError: null,
        quickbooksSendStatus: "not_sent",
        quickbooksSentAt: null,
        quickbooksSendError: null
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

  if (input.saveMapping && item.code) {
    await saveQuickBooksItemMappingForCode(actor, {
      internalCode: item.code,
      internalName: item.description,
      qbItemId: catalogItem.quickbooksItemId
    });
  }

  return {
    catalogItemId: catalogItem.id,
    catalogItemName: catalogItem.name
  };
}

export async function linkBillingSummaryItemGroupCatalog(
  actor: ActorContext,
  input: {
    summaryId: string;
    itemIds: string[];
    catalogItemId: string;
    saveMapping?: boolean;
    alias?: string | null;
  }
) {
  const { parsedActor, summary } = await getAuthorizedBillingSummary(actor, input.summaryId);
  if (summary.status === "invoiced") {
    throw new Error("Invoiced billing summaries must be moved back to review before linking items.");
  }

  const uniqueItemIds = [...new Set(input.itemIds.filter(Boolean))];
  const groupedItems = summary.items.filter((candidate) => uniqueItemIds.includes(candidate.id));
  if (!groupedItems.length || groupedItems.length !== uniqueItemIds.length) {
    throw new Error("Billing item group not found.");
  }

  const representativeItem = groupedItems[0]!;
  const firstKey = buildBillingReviewGroupKey(representativeItem);
  if (groupedItems.some((item) => buildBillingReviewGroupKey(item) !== firstKey)) {
    throw new Error("Only identical billing items can be linked as a grouped row.");
  }
  if (groupedItems.some((item) => isRuleControlledFeeItem(item))) {
    throw new Error("Automatic fee pricing is controlled by fee rules and cannot be edited here.");
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

  const groupedItemSet = new Set(uniqueItemIds);
  const updatedItems = summary.items.map((candidate) =>
    groupedItemSet.has(candidate.id)
      ? {
          ...candidate,
          unitPrice: catalogItem.unitPrice ?? null,
          amount: calculateAmount(candidate.quantity, catalogItem.unitPrice ?? null),
          linkedCatalogItemId: catalogItem.id,
          linkedCatalogItemName: catalogItem.name,
          linkedQuickBooksItemId: catalogItem.quickbooksItemId,
          linkedMatchMethod: "manual",
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
        quickbooksSyncError: null,
        quickbooksSendStatus: "not_sent",
        quickbooksSentAt: null,
        quickbooksSendError: null
      }
    });

    if (input.saveMapping) {
      await tx.billingItemCatalogMatch.upsert({
        where: {
          tenantId_sourceKey: {
            tenantId: parsedActor.tenantId as string,
            sourceKey: buildBillingItemSourceKey(representativeItem)
          }
        },
        update: {
          sourceName: representativeItem.description,
          normalizedSourceName: buildNormalizedTokenString(representativeItem.description),
          sourceCode: representativeItem.code ?? null,
          sourceCategory: representativeItem.category,
          sourceReportType: representativeItem.reportType,
          sourceSection: representativeItem.sourceSection ?? null,
          sourceField: representativeItem.sourceField ?? null,
          catalogItemId: catalogItem.id,
          confidence: 1,
          matchMethod: "manual",
          confirmedByUserId: parsedActor.userId,
          confirmedAt: new Date()
        },
        create: {
          tenantId: parsedActor.tenantId as string,
          sourceKey: buildBillingItemSourceKey(representativeItem),
          sourceName: representativeItem.description,
          normalizedSourceName: buildNormalizedTokenString(representativeItem.description),
          sourceCode: representativeItem.code ?? null,
          sourceCategory: representativeItem.category,
          sourceReportType: representativeItem.reportType,
          sourceSection: representativeItem.sourceSection ?? null,
          sourceField: representativeItem.sourceField ?? null,
          catalogItemId: catalogItem.id,
          confidence: 1,
          matchMethod: "manual",
          confirmedByUserId: parsedActor.userId,
          confirmedAt: new Date()
        }
      });

      const aliasValue = (input.alias?.trim() || representativeItem.description.trim());
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
        action: "billing.item_group_catalog_linked",
        entityType: "InspectionBillingSummary",
        entityId: summary.id,
        metadata: {
          itemIds: uniqueItemIds,
          itemDescription: representativeItem.description,
          sourceKey: buildBillingItemSourceKey(representativeItem),
          catalogItemId: catalogItem.id,
          catalogItemName: catalogItem.name,
          saveMapping: Boolean(input.saveMapping)
        }
      }
    });
  });

  if (input.saveMapping && representativeItem.code) {
    await saveQuickBooksItemMappingForCode(actor, {
      internalCode: representativeItem.code,
      internalName: representativeItem.description,
      qbItemId: catalogItem.quickbooksItemId
    });
  }

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
  if (isRuleControlledFeeItem(item)) {
    throw new Error("Automatic fee pricing is controlled by fee rules and cannot be edited here.");
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
      quickbooksSyncError: null,
      quickbooksSendStatus: "not_sent",
      quickbooksSentAt: null,
      quickbooksSendError: null
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

export async function clearBillingSummaryItemGroupCatalogLink(
  actor: ActorContext,
  input: {
    summaryId: string;
    itemIds: string[];
  }
) {
  const { parsedActor, summary } = await getAuthorizedBillingSummary(actor, input.summaryId);
  if (summary.status === "invoiced") {
    throw new Error("Invoiced billing summaries must be moved back to review before clearing links.");
  }

  const uniqueItemIds = [...new Set(input.itemIds.filter(Boolean))];
  const groupedItems = summary.items.filter((candidate) => uniqueItemIds.includes(candidate.id));
  if (!groupedItems.length || groupedItems.length !== uniqueItemIds.length) {
    throw new Error("Billing item group not found.");
  }

  const representativeItem = groupedItems[0]!;
  if (groupedItems.some((item) => isRuleControlledFeeItem(item))) {
    throw new Error("Automatic fee pricing is controlled by fee rules and cannot be edited here.");
  }
  const groupedItemSet = new Set(uniqueItemIds);
  const updatedItems = summary.items.map((candidate) =>
    groupedItemSet.has(candidate.id)
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
      quickbooksSyncError: null,
      quickbooksSendStatus: "not_sent",
      quickbooksSentAt: null,
      quickbooksSendError: null
    }
  });

  await prisma.auditLog.create({
    data: {
      tenantId: parsedActor.tenantId as string,
      actorUserId: parsedActor.userId,
      action: "billing.item_group_catalog_link_cleared",
      entityType: "InspectionBillingSummary",
      entityId: summary.id,
      metadata: {
        itemIds: uniqueItemIds,
        itemDescription: representativeItem.description,
        sourceKey: buildBillingItemSourceKey(representativeItem)
      }
    }
  });
}
