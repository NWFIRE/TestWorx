-- Production-safe repair for work-order labor billing configuration.
-- Creates the labor type table if a prior deploy missed it, and keeps labor snapshot columns nullable.
CREATE TABLE IF NOT EXISTS "WorkOrderLaborType" (
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

CREATE UNIQUE INDEX IF NOT EXISTS "WorkOrderLaborType_tenantId_code_key" ON "WorkOrderLaborType"("tenantId", "code");
CREATE INDEX IF NOT EXISTS "WorkOrderLaborType_tenantId_active_idx" ON "WorkOrderLaborType"("tenantId", "active");
CREATE INDEX IF NOT EXISTS "WorkOrderLaborType_tenantId_catalogItemId_idx" ON "WorkOrderLaborType"("tenantId", "catalogItemId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WorkOrderLaborType_tenantId_fkey'
  ) THEN
    ALTER TABLE "WorkOrderLaborType"
      ADD CONSTRAINT "WorkOrderLaborType_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'QuickBooksCatalogItem'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'WorkOrderLaborType_catalogItemId_fkey'
  ) THEN
    ALTER TABLE "WorkOrderLaborType"
      ADD CONSTRAINT "WorkOrderLaborType_catalogItemId_fkey"
      FOREIGN KEY ("catalogItemId") REFERENCES "QuickBooksCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'WorkOrderLineItem'
  ) THEN
    ALTER TABLE "WorkOrderLineItem" ADD COLUMN IF NOT EXISTS "laborTypeId" TEXT;
    ALTER TABLE "WorkOrderLineItem" ADD COLUMN IF NOT EXISTS "laborTypeName" TEXT;
    ALTER TABLE "WorkOrderLineItem" ADD COLUMN IF NOT EXISTS "laborHours" DOUBLE PRECISION;
    ALTER TABLE "WorkOrderLineItem" ADD COLUMN IF NOT EXISTS "laborRate" DOUBLE PRECISION;
    ALTER TABLE "WorkOrderLineItem" ADD COLUMN IF NOT EXISTS "laborTotal" DOUBLE PRECISION;
    ALTER TABLE "WorkOrderLineItem" ADD COLUMN IF NOT EXISTS "laborBillingLineId" TEXT;

    CREATE INDEX IF NOT EXISTS "WorkOrderLineItem_tenantId_laborTypeId_idx" ON "WorkOrderLineItem"("tenantId", "laborTypeId");
    CREATE INDEX IF NOT EXISTS "WorkOrderLineItem_tenantId_laborBillingLineId_idx" ON "WorkOrderLineItem"("tenantId", "laborBillingLineId");

    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'WorkOrderLineItem_laborTypeId_fkey'
    ) THEN
      ALTER TABLE "WorkOrderLineItem"
        ADD CONSTRAINT "WorkOrderLineItem_laborTypeId_fkey"
        FOREIGN KEY ("laborTypeId") REFERENCES "WorkOrderLaborType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
  END IF;
END $$;
