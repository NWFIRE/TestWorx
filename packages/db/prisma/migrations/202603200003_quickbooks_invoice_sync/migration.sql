ALTER TABLE "Tenant"
ADD COLUMN "quickbooksRealmId" TEXT,
ADD COLUMN "quickbooksCompanyName" TEXT,
ADD COLUMN "quickbooksAccessToken" TEXT,
ADD COLUMN "quickbooksRefreshToken" TEXT,
ADD COLUMN "quickbooksTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "quickbooksConnectedAt" TIMESTAMP(3);

ALTER TABLE "CustomerCompany"
ADD COLUMN "quickbooksCustomerId" TEXT;

ALTER TABLE "InspectionBillingSummary"
ADD COLUMN "quickbooksSyncStatus" TEXT DEFAULT 'not_synced',
ADD COLUMN "quickbooksInvoiceId" TEXT,
ADD COLUMN "quickbooksInvoiceNumber" TEXT,
ADD COLUMN "quickbooksCustomerId" TEXT,
ADD COLUMN "quickbooksSyncedAt" TIMESTAMP(3),
ADD COLUMN "quickbooksSyncError" TEXT;

CREATE UNIQUE INDEX "Tenant_quickbooksRealmId_key" ON "Tenant"("quickbooksRealmId");
