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
};

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

type FinalizedReportRow = {
  id: string;
  inspectionId: string;
  tenantId: string;
  contentJson: JsonValue | null;
  inspectionType: InspectionType;
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

async function buildInspectionServiceFeeItemTx(tx: Prisma.TransactionClient, input: {
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

async function getExistingBillingSummaryRow(tx: Prisma.TransactionClient | typeof prisma, inspectionId: string) {
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

export async function syncInspectionBillingSummaryTx(tx: Prisma.TransactionClient, input: {
  tenantId: string;
  inspectionId: string;
}) {
  const inspectionRows = await tx.$queryRaw<Array<{
    inspectionId: string;
    customerCompanyId: string;
    siteId: string;
  }>>(Prisma.sql`
    SELECT "id" AS "inspectionId", "customerCompanyId", "siteId"
    FROM "Inspection"
    WHERE "id" = ${input.inspectionId} AND "tenantId" = ${input.tenantId}
    LIMIT 1
  `);

  const inspection = inspectionRows[0];
  if (!inspection) {
    throw new Error("Inspection not found for billing summary sync.");
  }

  const reports = await tx.$queryRaw<FinalizedReportRow[]>(Prisma.sql`
    SELECT r."id", r."inspectionId", r."tenantId", r."contentJson", t."inspectionType"
    FROM "InspectionReport" r
    INNER JOIN "InspectionTask" t ON t."id" = r."inspectionTaskId"
    WHERE r."tenantId" = ${input.tenantId}
      AND r."inspectionId" = ${input.inspectionId}
      AND r."status"::text = ${reportStatuses.finalized}
  `);

  const extracted = reports.flatMap((report) =>
    extractBillableItemsFromFinalizedReport({
      tenantId: input.tenantId,
      inspectionId: input.inspectionId,
      reportId: report.id,
      reportType: report.inspectionType,
      contentJson: report.contentJson
    })
  );

  extracted.push(await buildInspectionServiceFeeItemTx(tx, input));

  const existing = await getExistingBillingSummaryRow(tx, input.inspectionId);
  if (extracted.length === 0) {
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM "InspectionBillingSummary"
      WHERE "inspectionId" = ${input.inspectionId} AND "tenantId" = ${input.tenantId}
    `);
    return null;
  }

  const mergedItems = mergeBillingItems(existing?.items ?? [], extracted);
  const subtotal = subtotalForItems(mergedItems);

  const summaryId = existing?.id ?? crypto.randomUUID();
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "InspectionBillingSummary" (
      "id", "tenantId", "inspectionId", "customerCompanyId", "siteId", "status", "items", "subtotal", "notes", "createdAt", "updatedAt"
    ) VALUES (
      ${summaryId},
      ${input.tenantId},
      ${input.inspectionId},
      ${inspection.customerCompanyId},
      ${inspection.siteId},
      ${existing?.status ?? "draft"},
      ${JSON.stringify(mergedItems)}::jsonb,
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
  `);

  return {
    id: summaryId,
    tenantId: input.tenantId,
    inspectionId: input.inspectionId,
    customerCompanyId: inspection.customerCompanyId,
    siteId: inspection.siteId,
    status: existing?.status ?? "draft",
    items: mergedItems,
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

  const rows = await prisma.$queryRaw<BillingSummaryListRow[]>(Prisma.sql`
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
  `);

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

  const rows = await prisma.$queryRaw<Array<{
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
  }>>(Prisma.sql`
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
  `);

  const row = rows[0];
  if (!row) {
    return null;
  }

  const items = normalizeExistingItems(row.items);
  return {
    ...row,
    status: row.status as BillingSummaryStatus,
    quickbooksSyncStatus: row.quickbooksSyncStatus ?? "not_synced",
    quickbooksInvoiceId: row.quickbooksInvoiceId ?? null,
    quickbooksInvoiceNumber: row.quickbooksInvoiceNumber ?? null,
    quickbooksConnectionMode: row.quickbooksConnectionMode ?? null,
    quickbooksSyncedAt: row.quickbooksSyncedAt ?? null,
    quickbooksSyncError: row.quickbooksSyncError ?? null,
    items,
    groupedItems: groupBillableItems(items),
    reportTypes: [...new Set(items.map((item) => item.reportType).filter((reportType) => reportType !== INSPECTION_LEVEL_REPORT_TYPE))],
    metrics: buildSummaryMetrics(items)
  };
}

async function getAuthorizedBillingSummary(actor: ActorContext, summaryId: string) {
  const parsedActor = parseActor(actor);
  ensureAdmin(parsedActor);

  const rows = await prisma.$queryRaw<Array<{
    id: string;
    tenantId: string;
    inspectionId: string;
    status: string;
    subtotal: number;
    notes: string | null;
    items: JsonValue;
  }>>(Prisma.sql`
    SELECT "id", "tenantId", "inspectionId", "status", "subtotal", "notes", "items"
    FROM "InspectionBillingSummary"
    WHERE "id" = ${summaryId} AND "tenantId" = ${parsedActor.tenantId as string}
    LIMIT 1
  `);

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
    await prisma.$executeRaw(Prisma.sql`
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
    `);
    return;
  }

  await prisma.$executeRaw(Prisma.sql`
    UPDATE "InspectionBillingSummary"
    SET "status" = ${status}, "updatedAt" = NOW()
    WHERE "id" = ${summary.id}
  `);
}

export async function updateBillingSummaryNotes(actor: ActorContext, summaryId: string, notes: string) {
  const { summary } = await getAuthorizedBillingSummary(actor, summaryId);
  if (summary.status === "invoiced") {
    throw new Error("Invoiced billing summaries must be moved back to review before editing notes.");
  }
  await prisma.$executeRaw(Prisma.sql`
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
  `);
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

  await prisma.$executeRaw(Prisma.sql`
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
  `);
}
