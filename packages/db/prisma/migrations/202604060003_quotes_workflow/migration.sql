CREATE TYPE "QuoteStatus" AS ENUM (
    'draft',
    'ready_to_send',
    'sent',
    'viewed',
    'approved',
    'declined',
    'expired',
    'converted',
    'cancelled'
);

CREATE TYPE "QuoteSyncStatus" AS ENUM (
    'not_synced',
    'sync_pending',
    'synced',
    'sync_error'
);

CREATE TYPE "QuoteDeliveryStatus" AS ENUM (
    'not_sent',
    'pending',
    'sent',
    'error'
);

CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "customerCompanyId" TEXT NOT NULL,
    "siteId" TEXT,
    "contactName" TEXT,
    "recipientEmail" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'draft',
    "syncStatus" "QuoteSyncStatus" NOT NULL DEFAULT 'not_synced',
    "deliveryStatus" "QuoteDeliveryStatus" NOT NULL DEFAULT 'not_sent',
    "quickbooksEstimateId" TEXT,
    "quickbooksEstimateNumber" TEXT,
    "quickbooksConnectionMode" "QuickBooksConnectionMode",
    "quickbooksCustomerId" TEXT,
    "quickbooksSyncedAt" TIMESTAMP(3),
    "quickbooksSyncError" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "internalNotes" TEXT,
    "customerNotes" TEXT,
    "deliverySubject" TEXT,
    "deliveryBody" TEXT,
    "lastSentToEmail" TEXT,
    "lastDeliveryMessageId" TEXT,
    "lastDeliveryError" TEXT,
    "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "convertedInspectionId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuoteLineItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "internalCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qbItemId" TEXT,
    "inspectionType" "InspectionType",
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QuoteLineItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Quote_tenantId_quoteNumber_key" ON "Quote"("tenantId", "quoteNumber");
CREATE INDEX "Quote_tenantId_status_idx" ON "Quote"("tenantId", "status");
CREATE INDEX "Quote_tenantId_syncStatus_idx" ON "Quote"("tenantId", "syncStatus");
CREATE INDEX "Quote_tenantId_customerCompanyId_idx" ON "Quote"("tenantId", "customerCompanyId");
CREATE INDEX "Quote_tenantId_siteId_idx" ON "Quote"("tenantId", "siteId");
CREATE INDEX "Quote_tenantId_issuedAt_idx" ON "Quote"("tenantId", "issuedAt");
CREATE INDEX "Quote_tenantId_sentAt_idx" ON "Quote"("tenantId", "sentAt");
CREATE INDEX "Quote_tenantId_expiresAt_idx" ON "Quote"("tenantId", "expiresAt");

CREATE INDEX "QuoteLineItem_tenantId_quoteId_idx" ON "QuoteLineItem"("tenantId", "quoteId");
CREATE INDEX "QuoteLineItem_tenantId_internalCode_idx" ON "QuoteLineItem"("tenantId", "internalCode");
CREATE INDEX "QuoteLineItem_tenantId_qbItemId_idx" ON "QuoteLineItem"("tenantId", "qbItemId");

ALTER TABLE "Quote"
    ADD CONSTRAINT "Quote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quote"
    ADD CONSTRAINT "Quote_customerCompanyId_fkey" FOREIGN KEY ("customerCompanyId") REFERENCES "CustomerCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quote"
    ADD CONSTRAINT "Quote_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Quote"
    ADD CONSTRAINT "Quote_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quote"
    ADD CONSTRAINT "Quote_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Quote"
    ADD CONSTRAINT "Quote_convertedInspectionId_fkey" FOREIGN KEY ("convertedInspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QuoteLineItem"
    ADD CONSTRAINT "QuoteLineItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "QuoteLineItem"
    ADD CONSTRAINT "QuoteLineItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
