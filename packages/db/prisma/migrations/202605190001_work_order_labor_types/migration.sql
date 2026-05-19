-- Add configurable labor types for work-order labor billing.
CREATE TABLE "WorkOrderLaborType" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT,
  "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "taxable" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "quickBooksItemId" TEXT,
  "catalogItemId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkOrderLaborType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkOrderLaborType_tenantId_code_key" ON "WorkOrderLaborType"("tenantId", "code");
CREATE INDEX "WorkOrderLaborType_tenantId_active_idx" ON "WorkOrderLaborType"("tenantId", "active");
CREATE INDEX "WorkOrderLaborType_tenantId_catalogItemId_idx" ON "WorkOrderLaborType"("tenantId", "catalogItemId");

ALTER TABLE "WorkOrderLaborType"
  ADD CONSTRAINT "WorkOrderLaborType_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkOrderLaborType"
  ADD CONSTRAINT "WorkOrderLaborType_catalogItemId_fkey"
  FOREIGN KEY ("catalogItemId") REFERENCES "QuickBooksCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkOrderLineItem" ADD COLUMN "laborTypeId" TEXT;
ALTER TABLE "WorkOrderLineItem" ADD COLUMN "laborTypeName" TEXT;
ALTER TABLE "WorkOrderLineItem" ADD COLUMN "laborRate" DOUBLE PRECISION;
ALTER TABLE "WorkOrderLineItem" ADD COLUMN "laborTotal" DOUBLE PRECISION;

CREATE INDEX "WorkOrderLineItem_tenantId_laborTypeId_idx" ON "WorkOrderLineItem"("tenantId", "laborTypeId");

ALTER TABLE "WorkOrderLineItem"
  ADD CONSTRAINT "WorkOrderLineItem_laborTypeId_fkey"
  FOREIGN KEY ("laborTypeId") REFERENCES "WorkOrderLaborType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
