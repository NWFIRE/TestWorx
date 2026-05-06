import { Prisma, WorkOrderLineBillableStatus, WorkOrderLineItemType, WorkOrderLineSource } from "@prisma/client";
import { prisma } from "@testworx/db";

import type { ActorContext } from "@testworx/types";
import { actorContextSchema } from "@testworx/types";

import { assertTenantContext } from "./permissions";
import { syncInspectionBillingSummaryTx } from "./inspection-billing";

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
  synced: boolean;
  invoiced: boolean;
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
  const lines = await prisma.workOrderLineItem.findMany({
    where: {
      tenantId: parsedActor.tenantId as string,
      inspectionId
    },
    orderBy: [{ createdAt: "asc" }]
  });

  return lines.map(toLineItemView);
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

export async function deleteWorkOrderLineItem(actor: ActorContext, input: {
  inspectionId: string;
  lineItemId: string;
}) {
  const { parsedActor } = await getAuthorizedWorkOrderInspection(actor, input.inspectionId);
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
