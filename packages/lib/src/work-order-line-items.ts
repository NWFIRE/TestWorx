import { Prisma, WorkOrderLineBillableStatus, WorkOrderLineItemType, WorkOrderLineSource } from "@prisma/client";
import { prisma } from "@testworx/db";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import { assertTenantContext } from "./permissions";
import { syncInspectionBillingSummaryTx } from "./inspection-billing";
import { assertWorkOrderLaborTypeTable, assertWorkOrderLineItemTable, hasWorkOrderLaborLineColumns, hasWorkOrderLaborTypeTable, hasWorkOrderLineItemTable } from "./work-order-line-item-table";

function parseActor(actor: ActorContext) {
  const parsed = actorContextSchema.parse(actor);
  assertTenantContext(parsed.role, parsed.tenantId);
  return parsed;
}

function isAdminRole(role: string) {
  return ["platform_admin", "tenant_admin", "office_admin"].includes(role);
}

function mapCatalogItemTypeToWorkOrderLineType(itemType: string): WorkOrderLineItemType {
  const normalized = itemType.toLowerCase();
  if (normalized.includes("labor")) {
    return WorkOrderLineItemType.labor;
  }
  if (normalized.includes("inspection")) {
    return WorkOrderLineItemType.inspection;
  }
  if (normalized.includes("part")) {
    return WorkOrderLineItemType.part;
  }
  if (normalized.includes("material") || normalized.includes("inventory") || normalized.includes("noninventory")) {
    return WorkOrderLineItemType.material;
  }
  if (normalized.includes("fee")) {
    return WorkOrderLineItemType.fee;
  }
  if (normalized.includes("replacement")) {
    return WorkOrderLineItemType.replacement;
  }
  return WorkOrderLineItemType.service;
}

function readCatalogRawString(rawJson: Prisma.JsonValue | null | undefined, keys: string[]) {
  if (!rawJson || typeof rawJson !== "object" || Array.isArray(rawJson)) {
    return null;
  }

  const record = rawJson as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function readCatalogDescription(rawJson: Prisma.JsonValue | null | undefined) {
  return readCatalogRawString(rawJson, ["Description", "SalesDesc", "PurchaseDesc", "FullyQualifiedName"]);
}

const DEFAULT_WORK_ORDER_LABOR_TYPES = [
  { code: "fire_alarm", name: "Fire Alarm", sortOrder: 10 },
  { code: "kitchen_suppression", name: "Kitchen Suppression", sortOrder: 20 },
  { code: "fire_sprinkler", name: "Fire Sprinkler", sortOrder: 30 },
  { code: "fire_extinguishers", name: "Fire Extinguishers", sortOrder: 40 },
  { code: "emergency_light", name: "Emergency Light", sortOrder: 50 },
  { code: "industrial_dry_chemical", name: "Industrial Dry Chemical", sortOrder: 60 },
  { code: "backflow", name: "Backflow", sortOrder: 70 },
  { code: "general_service", name: "General Service", sortOrder: 80 },
  { code: "other", name: "Other", sortOrder: 90 }
];

async function ensureDefaultLaborTypes(tenantId: string) {
  if (!await hasWorkOrderLaborTypeTable()) {
    return;
  }

  await prisma.$transaction(DEFAULT_WORK_ORDER_LABOR_TYPES.map((laborType) => (
    prisma.workOrderLaborType.upsert({
      where: {
        tenantId_code: {
          tenantId,
          code: laborType.code
        }
      },
      update: {},
      create: {
        tenantId,
        code: laborType.code,
        name: laborType.name,
        sortOrder: laborType.sortOrder,
        active: true,
        taxable: false,
        rate: 0
      }
    })
  )));
}

async function getAuthorizedWorkOrderInspection(actor: ActorContext, inspectionId: string) {
  const parsedActor = parseActor(actor);
  const tenantId = parsedActor.tenantId as string;
  const inspection = await prisma.inspection.findFirst({
    where: {
      id: inspectionId,
      tenantId,
      tasks: { some: { inspectionType: "work_order" } }
    },
    include: {
      technicianAssignments: { select: { technicianId: true } }
    }
  });

  if (!inspection) {
    throw new Error("Work order inspection not found.");
  }

  if (!isAdminRole(parsedActor.role)) {
    const assignedTechnicianIds = new Set([
      inspection.assignedTechnicianId,
      ...inspection.technicianAssignments.map((assignment) => assignment.technicianId)
    ].filter(Boolean));
    if (parsedActor.role !== "technician" || !assignedTechnicianIds.has(parsedActor.userId)) {
      throw new Error("Technician does not have access to this work order.");
    }
  }

  return { parsedActor, inspection };
}

export type WorkOrderCatalogItemForSelection = {
  id: string;
  quickbooksItemId: string;
  name: string;
  sku: string | null;
  itemType: string;
  description: string | null;
  unitPrice: number | null;
  taxable: boolean;
};

export type WorkOrderLineItemView = {
  id: string;
  inspectionId: string;
  catalogItemId: string | null;
  itemType: string;
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  taxable: boolean;
  billableStatus: string;
  technicianNotes: string | null;
  source: string;
  quickBooksItemId: string | null;
  laborTypeId: string | null;
  laborTypeName: string | null;
  laborHours: number | null;
  laborRate: number | null;
  laborTotal: number | null;
  laborBillingLineId: string | null;
  synced: boolean;
  invoiced: boolean;
};

export type WorkOrderLaborTypeView = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  rate: number;
  taxable: boolean;
  active: boolean;
  quickBooksItemId: string | null;
  catalogItemId: string | null;
  catalogItemName: string | null;
  sortOrder: number;
};

function toLineItemView(line: {
  id: string;
  inspectionId: string;
  catalogItemId: string | null;
  itemType: WorkOrderLineItemType;
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  taxable: boolean;
  billableStatus: WorkOrderLineBillableStatus;
  technicianNotes: string | null;
  source: WorkOrderLineSource;
  quickBooksItemId: string | null;
  laborTypeId?: string | null;
  laborTypeName?: string | null;
  laborHours?: number | null;
  laborRate?: number | null;
  laborTotal?: number | null;
  laborBillingLineId?: string | null;
  invoicedAt: Date | null;
}): WorkOrderLineItemView {
  return {
    id: line.id,
    inspectionId: line.inspectionId,
    catalogItemId: line.catalogItemId,
    itemType: line.itemType,
    name: line.name,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    totalPrice: line.totalPrice,
    taxable: line.taxable,
    billableStatus: line.billableStatus,
    technicianNotes: line.technicianNotes,
    source: line.source,
    quickBooksItemId: line.quickBooksItemId,
    laborTypeId: line.laborTypeId ?? null,
    laborTypeName: line.laborTypeName ?? null,
    laborHours: line.laborHours ?? null,
    laborRate: line.laborRate ?? null,
    laborTotal: line.laborTotal ?? null,
    laborBillingLineId: line.laborBillingLineId ?? null,
    synced: true,
    invoiced: Boolean(line.invoicedAt)
  };
}

export async function getWorkOrderCatalogItems(actor: ActorContext, inspectionId: string) {
  const { parsedActor } = await getAuthorizedWorkOrderInspection(actor, inspectionId);
  const items = await prisma.quickBooksCatalogItem.findMany({
    where: {
      tenantId: parsedActor.tenantId as string,
      active: true
    },
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      quickbooksItemId: true,
      name: true,
      sku: true,
      itemType: true,
      rawJson: true,
      unitPrice: true,
      taxable: true
    }
  });

  return items.map((item) => ({
    id: item.id,
    quickbooksItemId: item.quickbooksItemId,
    name: item.name,
    sku: item.sku,
    itemType: item.itemType,
    description: readCatalogDescription(item.rawJson),
    unitPrice: item.unitPrice,
    taxable: item.taxable
  })) satisfies WorkOrderCatalogItemForSelection[];
}

export async function getWorkOrderLineItems(actor: ActorContext, inspectionId: string) {
  const { parsedActor } = await getAuthorizedWorkOrderInspection(actor, inspectionId);
  if (!await hasWorkOrderLineItemTable()) {
    return [] satisfies WorkOrderLineItemView[];
  }

  const laborColumnsReady = await hasWorkOrderLaborLineColumns();
  const lines = await prisma.workOrderLineItem.findMany({
    where: {
      tenantId: parsedActor.tenantId as string,
      inspectionId
    },
    select: {
      id: true,
      inspectionId: true,
      catalogItemId: true,
      itemType: true,
      name: true,
      description: true,
      quantity: true,
      unitPrice: true,
      totalPrice: true,
      taxable: true,
      billableStatus: true,
      technicianNotes: true,
      source: true,
      quickBooksItemId: true,
      invoicedAt: true,
      ...(laborColumnsReady
        ? {
            laborTypeId: true,
            laborTypeName: true,
            laborHours: true,
            laborRate: true,
            laborTotal: true,
            laborBillingLineId: true
          }
        : {})
    },
    orderBy: [{ createdAt: "asc" }]
  });

  return lines.map(toLineItemView);
}

export async function getWorkOrderLaborTypes(actor: ActorContext, inspectionId: string) {
  const { parsedActor } = await getAuthorizedWorkOrderInspection(actor, inspectionId);
  if (!await hasWorkOrderLaborTypeTable()) {
    return [] satisfies WorkOrderLaborTypeView[];
  }

  const tenantId = parsedActor.tenantId as string;
  await ensureDefaultLaborTypes(tenantId);
  const laborTypes = await prisma.workOrderLaborType.findMany({
    where: {
      tenantId,
      active: true
    },
    include: {
      catalogItem: {
        select: {
          id: true,
          name: true,
          quickbooksItemId: true
        }
      }
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });

  return laborTypes.map((laborType) => ({
    id: laborType.id,
    name: laborType.name,
    code: laborType.code,
    description: laborType.description,
    rate: laborType.rate,
    taxable: laborType.taxable,
    active: laborType.active,
    quickBooksItemId: laborType.catalogItem?.quickbooksItemId ?? laborType.quickBooksItemId,
    catalogItemId: laborType.catalogItemId,
    catalogItemName: laborType.catalogItem?.name ?? null,
    sortOrder: laborType.sortOrder
  })) satisfies WorkOrderLaborTypeView[];
}

export async function getTenantWorkOrderLaborTypeSettings(actor: ActorContext) {
  const parsedActor = parseActor(actor);
  if (!isAdminRole(parsedActor.role)) {
    throw new Error("Only administrators can manage work order labor rates.");
  }

  if (!await hasWorkOrderLaborTypeTable()) {
    return {
      storageReady: false,
      laborTypes: [] satisfies WorkOrderLaborTypeView[],
      catalogItems: [] as Array<{ id: string; name: string; quickbooksItemId: string; itemType: string; unitPrice: number | null; taxable: boolean }>
    };
  }

  const tenantId = parsedActor.tenantId as string;
  await ensureDefaultLaborTypes(tenantId);
  const [laborTypes, catalogItems] = await Promise.all([
    prisma.workOrderLaborType.findMany({
      where: { tenantId },
      include: {
        catalogItem: {
          select: { id: true, name: true, quickbooksItemId: true }
        }
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
    }),
    prisma.quickBooksCatalogItem.findMany({
      where: {
        tenantId,
        active: true
      },
      orderBy: [{ name: "asc" }],
      select: {
        id: true,
        name: true,
        quickbooksItemId: true,
        itemType: true,
        unitPrice: true,
        taxable: true
      }
    })
  ]);

  return {
    storageReady: true,
    laborTypes: laborTypes.map((laborType) => ({
      id: laborType.id,
      name: laborType.name,
      code: laborType.code,
      description: laborType.description,
      rate: laborType.rate,
      taxable: laborType.taxable,
      active: laborType.active,
      quickBooksItemId: laborType.catalogItem?.quickbooksItemId ?? laborType.quickBooksItemId,
      catalogItemId: laborType.catalogItemId,
      catalogItemName: laborType.catalogItem?.name ?? null,
      sortOrder: laborType.sortOrder
    })) satisfies WorkOrderLaborTypeView[],
    catalogItems
  };
}

export async function updateWorkOrderLaborTypeSettings(actor: ActorContext, input: {
  laborTypeId: string;
  rate: number;
  taxable?: boolean;
  active?: boolean;
  catalogItemId?: string | null;
}) {
  const parsedActor = parseActor(actor);
  if (!isAdminRole(parsedActor.role)) {
    throw new Error("Only administrators can manage work order labor rates.");
  }

  await assertWorkOrderLaborTypeTable();
  const tenantId = parsedActor.tenantId as string;
  await ensureDefaultLaborTypes(tenantId);
  const existing = await prisma.workOrderLaborType.findFirst({
    where: { id: input.laborTypeId, tenantId }
  });
  if (!existing) {
    throw new Error("Labor type not found.");
  }

  const catalogItem = input.catalogItemId
    ? await prisma.quickBooksCatalogItem.findFirst({
        where: { id: input.catalogItemId, tenantId, active: true },
        select: { id: true, quickbooksItemId: true, taxable: true }
      })
    : null;
  if (input.catalogItemId && !catalogItem) {
    throw new Error("Select an active QuickBooks product/service item for this labor type.");
  }

  const saved = await prisma.workOrderLaborType.update({
    where: { id: existing.id },
    data: {
      rate: Number.isFinite(input.rate) ? Math.max(0, Number(input.rate.toFixed(2))) : existing.rate,
      taxable: typeof input.taxable === "boolean" ? input.taxable : existing.taxable,
      active: typeof input.active === "boolean" ? input.active : existing.active,
      catalogItemId: catalogItem?.id ?? null,
      quickBooksItemId: catalogItem?.quickbooksItemId ?? null
    }
  });

  await prisma.auditLog.create({
    data: {
      tenantId,
      actorUserId: parsedActor.userId,
      action: "work_order.labor_type_updated",
      entityType: "WorkOrderLaborType",
      entityId: saved.id,
      metadata: {
        name: saved.name,
        rate: saved.rate,
        taxable: saved.taxable,
        active: saved.active,
        quickBooksItemId: saved.quickBooksItemId,
        catalogItemId: saved.catalogItemId
      }
    }
  });

  return saved;
}

export async function upsertWorkOrderLineItem(actor: ActorContext, input: {
  id?: string | null;
  inspectionId: string;
  catalogItemId: string;
  quantity: number;
  unitPrice?: number | null;
  billableStatus?: WorkOrderLineBillableStatus | string | null;
  technicianNotes?: string | null;
}) {
  const { parsedActor } = await getAuthorizedWorkOrderInspection(actor, input.inspectionId);
  await assertWorkOrderLineItemTable();
  const tenantId = parsedActor.tenantId as string;
  const catalogItem = await prisma.quickBooksCatalogItem.findFirst({
    where: {
      id: input.catalogItemId,
      tenantId,
      active: true
    },
    select: {
      id: true,
      quickbooksItemId: true,
      name: true,
      itemType: true,
      rawJson: true,
      unitPrice: true,
      taxable: true
    }
  });

  if (!catalogItem) {
    throw new Error("Select an active product or service.");
  }

  const existing = input.id
    ? await prisma.workOrderLineItem.findFirst({
        where: {
          id: input.id,
          tenantId,
          inspectionId: input.inspectionId
        }
      })
    : null;

  if (existing?.invoicedAt) {
    throw new Error("This work order line has already been invoiced and cannot be edited.");
  }

  const quantity = Number.isFinite(input.quantity) ? Math.max(1, Math.trunc(input.quantity)) : 1;
  const unitPrice = typeof input.unitPrice === "number" && Number.isFinite(input.unitPrice)
    ? input.unitPrice
    : catalogItem.unitPrice ?? 0;
  const totalPrice = Number((quantity * unitPrice).toFixed(2));
  const source = parsedActor.role === "technician" ? WorkOrderLineSource.technician_selected : WorkOrderLineSource.admin_added;
  const billableStatus = input.billableStatus && Object.values(WorkOrderLineBillableStatus).includes(input.billableStatus as WorkOrderLineBillableStatus)
    ? input.billableStatus as WorkOrderLineBillableStatus
    : WorkOrderLineBillableStatus.billable;
  const pricingSnapshot = {
    catalogItemId: catalogItem.id,
    catalogItemName: catalogItem.name,
    quickBooksItemId: catalogItem.quickbooksItemId,
    catalogUnitPrice: catalogItem.unitPrice,
    selectedUnitPrice: unitPrice,
    taxable: catalogItem.taxable,
    source,
    snapshottedAt: new Date().toISOString()
  };

  const laborColumnsReady = await hasWorkOrderLaborLineColumns();
  const data = {
    tenantId,
    inspectionId: input.inspectionId,
    catalogItemId: catalogItem.id,
    itemType: mapCatalogItemTypeToWorkOrderLineType(catalogItem.itemType),
    name: catalogItem.name,
    description: readCatalogDescription(catalogItem.rawJson),
    quantity,
    unitPrice,
    totalPrice,
    taxable: catalogItem.taxable,
    billableStatus,
    technicianNotes: input.technicianNotes?.trim() || null,
    source,
    quickBooksItemId: catalogItem.quickbooksItemId,
    pricingSnapshot,
    addedByUserId: parsedActor.userId,
    ...(laborColumnsReady
      ? {
          laborTypeId: null,
          laborTypeName: null,
          laborHours: null,
          laborRate: null,
          laborTotal: null,
          laborBillingLineId: null
        }
      : {})
  };

  const saved = existing
    ? await prisma.workOrderLineItem.update({
        where: { id: existing.id },
        data
      })
    : await prisma.workOrderLineItem.create({
        data: {
          id: input.id?.trim() || undefined,
          ...data
        }
      });

  await prisma.auditLog.create({
    data: {
      tenantId,
      actorUserId: parsedActor.userId,
      action: existing ? "work_order.line_item_updated" : "work_order.line_item_added",
      entityType: "WorkOrderLineItem",
      entityId: saved.id,
      metadata: {
        inspectionId: input.inspectionId,
        catalogItemId: catalogItem.id,
        quantity,
        unitPrice,
        billableStatus
      }
    }
  });

  const activeSummary = await prisma.inspectionBillingSummary.findFirst({
    where: {
      tenantId,
      inspectionId: input.inspectionId,
      status: { not: "invoiced" }
    },
    select: { id: true }
  });
  if (activeSummary) {
    await prisma.$transaction((tx) => syncInspectionBillingSummaryTx(tx, {
      tenantId,
      inspectionId: input.inspectionId
    }));
  }

  return toLineItemView(saved);
}

export async function upsertWorkOrderLaborLineItem(actor: ActorContext, input: {
  id?: string | null;
  inspectionId: string;
  laborTypeId: string;
  laborHours: number;
  billableStatus?: WorkOrderLineBillableStatus | string | null;
  technicianNotes?: string | null;
}) {
  const { parsedActor } = await getAuthorizedWorkOrderInspection(actor, input.inspectionId);
  await assertWorkOrderLineItemTable();
  await assertWorkOrderLaborTypeTable();
  if (!await hasWorkOrderLaborLineColumns()) {
    throw new Error("Work order labor billing settings are still being deployed. Try again after the database migration finishes.");
  }
  const tenantId = parsedActor.tenantId as string;
  const laborType = await prisma.workOrderLaborType.findFirst({
    where: {
      id: input.laborTypeId,
      tenantId,
      active: true
    },
    include: {
      catalogItem: {
        select: {
          id: true,
          name: true,
          quickbooksItemId: true,
          taxable: true,
          rawJson: true
        }
      }
    }
  });

  if (!laborType) {
    throw new Error("Select an active labor type.");
  }

  const existing = input.id
    ? await prisma.workOrderLineItem.findFirst({
        where: {
          id: input.id,
          tenantId,
          inspectionId: input.inspectionId
        }
      })
    : await prisma.workOrderLineItem.findFirst({
        where: {
          tenantId,
          inspectionId: input.inspectionId,
          itemType: WorkOrderLineItemType.labor,
          laborTypeId: { not: null },
          invoicedAt: null
        },
        orderBy: { createdAt: "asc" }
      });

  if (existing?.invoicedAt) {
    throw new Error("This labor line has already been invoiced and cannot be edited.");
  }

  const laborHours = Number.isFinite(input.laborHours) ? Math.max(0, Number(input.laborHours.toFixed(2))) : 0;
  if (laborHours <= 0) {
    if (existing) {
      await deleteWorkOrderLineItem(actor, { inspectionId: input.inspectionId, lineItemId: existing.id });
    }
    return null;
  }

  const laborRate = Number.isFinite(laborType.rate) ? laborType.rate : 0;
  const laborTotal = Number((laborHours * laborRate).toFixed(2));
  const source = parsedActor.role === "technician" ? WorkOrderLineSource.technician_selected : WorkOrderLineSource.admin_added;
  const billableStatus = input.billableStatus && Object.values(WorkOrderLineBillableStatus).includes(input.billableStatus as WorkOrderLineBillableStatus)
    ? input.billableStatus as WorkOrderLineBillableStatus
    : WorkOrderLineBillableStatus.billable;
  const linkedQuickBooksItemId = laborType.catalogItem?.quickbooksItemId ?? laborType.quickBooksItemId ?? null;
  const taxable = laborType.taxable;
  const description = laborType.description?.trim() || laborType.catalogItem?.name || `${laborType.name} labor`;
  const pricingSnapshot = {
    laborTypeId: laborType.id,
    laborTypeCode: laborType.code,
    laborTypeName: laborType.name,
    laborHours,
    laborRate,
    laborTotal,
    taxable,
    catalogItemId: laborType.catalogItemId,
    quickBooksItemId: linkedQuickBooksItemId,
    source,
    snapshottedAt: new Date().toISOString()
  };

  const data = {
    tenantId,
    inspectionId: input.inspectionId,
    catalogItemId: laborType.catalogItemId,
    itemType: WorkOrderLineItemType.labor,
    name: `${laborType.name} Labor`,
    description,
    quantity: laborHours,
    unitPrice: laborRate,
    totalPrice: laborTotal,
    taxable,
    billableStatus,
    technicianNotes: input.technicianNotes?.trim() || null,
    source,
    quickBooksItemId: linkedQuickBooksItemId,
    laborTypeId: laborType.id,
    laborTypeName: laborType.name,
    laborHours,
    laborRate,
    laborTotal,
    laborBillingLineId: null,
    pricingSnapshot,
    addedByUserId: parsedActor.userId
  };

  const saved = existing
    ? await prisma.workOrderLineItem.update({
        where: { id: existing.id },
        data
      })
    : await prisma.workOrderLineItem.create({
        data: {
          id: input.id?.trim() || undefined,
          ...data
        }
      });

  await prisma.auditLog.create({
    data: {
      tenantId,
      actorUserId: parsedActor.userId,
      action: existing ? "work_order.labor_line_updated" : "work_order.labor_line_added",
      entityType: "WorkOrderLineItem",
      entityId: saved.id,
      metadata: {
        inspectionId: input.inspectionId,
        laborTypeId: laborType.id,
        laborTypeName: laborType.name,
        laborHours,
        laborRate,
        laborTotal,
        billableStatus
      }
    }
  });

  const activeSummary = await prisma.inspectionBillingSummary.findFirst({
    where: {
      tenantId,
      inspectionId: input.inspectionId,
      status: { not: "invoiced" }
    },
    select: { id: true }
  });
  if (activeSummary) {
    await prisma.$transaction((tx) => syncInspectionBillingSummaryTx(tx, {
      tenantId,
      inspectionId: input.inspectionId
    }));
  }

  return toLineItemView(saved);
}

export async function deleteWorkOrderLineItem(actor: ActorContext, input: {
  inspectionId: string;
  lineItemId: string;
}) {
  const { parsedActor } = await getAuthorizedWorkOrderInspection(actor, input.inspectionId);
  if (!await hasWorkOrderLineItemTable()) {
    return { ok: true };
  }

  const tenantId = parsedActor.tenantId as string;
  const existing = await prisma.workOrderLineItem.findFirst({
    where: {
      id: input.lineItemId,
      tenantId,
      inspectionId: input.inspectionId
    }
  });

  if (!existing) {
    return { ok: true };
  }

  if (existing.invoicedAt) {
    throw new Error("This work order line has already been invoiced and cannot be removed.");
  }

  await prisma.workOrderLineItem.delete({ where: { id: existing.id } });
  await prisma.auditLog.create({
    data: {
      tenantId,
      actorUserId: parsedActor.userId,
      action: "work_order.line_item_removed",
      entityType: "WorkOrderLineItem",
      entityId: existing.id,
      metadata: {
        inspectionId: input.inspectionId,
        catalogItemId: existing.catalogItemId,
        name: existing.name
      }
    }
  });

  const activeSummary = await prisma.inspectionBillingSummary.findFirst({
    where: {
      tenantId,
      inspectionId: input.inspectionId,
      status: { not: "invoiced" }
    },
    select: { id: true }
  });
  if (activeSummary) {
    await prisma.$transaction((tx) => syncInspectionBillingSummaryTx(tx, {
      tenantId,
      inspectionId: input.inspectionId
    }));
  }

  return { ok: true };
}
