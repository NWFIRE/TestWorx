-- Additional nullable snapshots for work-order labor billing. Safe for existing rows.
ALTER TABLE "WorkOrderLineItem" ADD COLUMN IF NOT EXISTS "laborHours" DOUBLE PRECISION;
ALTER TABLE "WorkOrderLineItem" ADD COLUMN IF NOT EXISTS "laborBillingLineId" TEXT;

CREATE INDEX IF NOT EXISTS "WorkOrderLineItem_tenantId_laborBillingLineId_idx" ON "WorkOrderLineItem"("tenantId", "laborBillingLineId");
