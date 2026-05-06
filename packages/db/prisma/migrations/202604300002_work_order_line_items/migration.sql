-- Work order line items for catalog-backed billable activity.
CREATE TYPE "WorkOrderLineItemType" AS ENUM ('service', 'labor', 'part', 'material', 'inspection', 'fee', 'replacement', 'other');
CREATE TYPE "WorkOrderLineBillableStatus" AS ENUM ('billable', 'not_billable', 'included', 'warranty', 'no_charge');
CREATE TYPE "WorkOrderLineSource" AS ENUM ('technician_selected', 'admin_added', 'report_generated', 'minimum_rule', 'contract_rule');

CREATE TABLE "WorkOrderLineItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "catalogItemId" TEXT,
    "itemType" "WorkOrderLineItemType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION,
    "totalPrice" DOUBLE PRECISION,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "billableStatus" "WorkOrderLineBillableStatus" NOT NULL DEFAULT 'billable',
    "technicianNotes" TEXT,
    "source" "WorkOrderLineSource" NOT NULL DEFAULT 'admin_added',
    "quickBooksItemId" TEXT,
    "pricingSnapshot" JSONB,
    "addedByUserId" TEXT,
    "invoicedBillingSummaryId" TEXT,
    "invoicedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkOrderLineItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkOrderLineItem_tenantId_inspectionId_idx" ON "WorkOrderLineItem"("tenantId", "inspectionId");
CREATE INDEX "WorkOrderLineItem_tenantId_catalogItemId_idx" ON "WorkOrderLineItem"("tenantId", "catalogItemId");
CREATE INDEX "WorkOrderLineItem_tenantId_billableStatus_idx" ON "WorkOrderLineItem"("tenantId", "billableStatus");
CREATE INDEX "WorkOrderLineItem_tenantId_invoicedBillingSummaryId_idx" ON "WorkOrderLineItem"("tenantId", "invoicedBillingSummaryId");

ALTER TABLE "WorkOrderLineItem" ADD CONSTRAINT "WorkOrderLineItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WorkOrderLineItem" ADD CONSTRAINT "WorkOrderLineItem_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkOrderLineItem" ADD CONSTRAINT "WorkOrderLineItem_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "QuickBooksCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkOrderLineItem" ADD CONSTRAINT "WorkOrderLineItem_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
