CREATE TABLE "InspectionBillingSummary" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "customerCompanyId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "items" JSONB NOT NULL,
  "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InspectionBillingSummary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InspectionBillingSummary_inspectionId_key" ON "InspectionBillingSummary"("inspectionId");
CREATE INDEX "InspectionBillingSummary_tenantId_status_idx" ON "InspectionBillingSummary"("tenantId", "status");
CREATE INDEX "InspectionBillingSummary_tenantId_customerCompanyId_idx" ON "InspectionBillingSummary"("tenantId", "customerCompanyId");
CREATE INDEX "InspectionBillingSummary_tenantId_siteId_idx" ON "InspectionBillingSummary"("tenantId", "siteId");

ALTER TABLE "InspectionBillingSummary"
ADD CONSTRAINT "InspectionBillingSummary_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InspectionBillingSummary"
ADD CONSTRAINT "InspectionBillingSummary_inspectionId_fkey"
FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InspectionBillingSummary"
ADD CONSTRAINT "InspectionBillingSummary_customerCompanyId_fkey"
FOREIGN KEY ("customerCompanyId") REFERENCES "CustomerCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InspectionBillingSummary"
ADD CONSTRAINT "InspectionBillingSummary_siteId_fkey"
FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
