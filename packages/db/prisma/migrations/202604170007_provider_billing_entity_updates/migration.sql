-- CreateEnum
CREATE TYPE "InvoicePayerType" AS ENUM (
  'customer',
  'provider'
);

-- AlterTable
ALTER TABLE "Inspection"
ADD COLUMN "providerContextId" TEXT,
ADD COLUMN "sourceType" "WorkOrderProviderSourceType" NOT NULL DEFAULT 'direct';

-- AlterTable
ALTER TABLE "InspectionBillingSummary"
ADD COLUMN "payerType" "InvoicePayerType" NOT NULL DEFAULT 'customer',
ADD COLUMN "payerCustomerId" TEXT,
ADD COLUMN "payerProviderAccountId" TEXT,
ADD COLUMN "billingResolutionSnapshotId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_providerContextId_key"
ON "Inspection"("providerContextId");

-- CreateIndex
CREATE INDEX "Inspection_tenantId_sourceType_idx"
ON "Inspection"("tenantId", "sourceType");

-- CreateIndex
CREATE INDEX "InspectionBillingSummary_tenantId_payerType_idx"
ON "InspectionBillingSummary"("tenantId", "payerType");

-- CreateIndex
CREATE INDEX "InspectionBillingSummary_tenantId_payerCustomerId_idx"
ON "InspectionBillingSummary"("tenantId", "payerCustomerId");

-- CreateIndex
CREATE INDEX "InspectionBillingSummary_tenantId_payerProviderAccountId_idx"
ON "InspectionBillingSummary"("tenantId", "payerProviderAccountId");

-- CreateIndex
CREATE INDEX "InspectionBillingSummary_tenantId_billingResolutionSnapshotId_idx"
ON "InspectionBillingSummary"("tenantId", "billingResolutionSnapshotId");

-- AddForeignKey
ALTER TABLE "Inspection"
ADD CONSTRAINT "Inspection_providerContextId_fkey"
FOREIGN KEY ("providerContextId") REFERENCES "WorkOrderProviderContext"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionBillingSummary"
ADD CONSTRAINT "InspectionBillingSummary_payerCustomerId_fkey"
FOREIGN KEY ("payerCustomerId") REFERENCES "CustomerCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionBillingSummary"
ADD CONSTRAINT "InspectionBillingSummary_payerProviderAccountId_fkey"
FOREIGN KEY ("payerProviderAccountId") REFERENCES "ContractProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionBillingSummary"
ADD CONSTRAINT "InspectionBillingSummary_billingResolutionSnapshotId_fkey"
FOREIGN KEY ("billingResolutionSnapshotId") REFERENCES "BillingResolutionSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
