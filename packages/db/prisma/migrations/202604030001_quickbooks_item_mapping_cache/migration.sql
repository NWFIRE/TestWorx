-- CreateTable
CREATE TABLE "QuickBooksItemMap" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "internalCode" TEXT NOT NULL,
    "internalName" TEXT NOT NULL,
    "qbItemId" TEXT NOT NULL,
    "qbItemName" TEXT NOT NULL,
    "qbItemType" TEXT,
    "qbSyncToken" TEXT,
    "qbActive" BOOLEAN NOT NULL DEFAULT true,
    "matchSource" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickBooksItemMap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuickBooksItemCache" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "qbItemId" TEXT NOT NULL,
    "qbItemName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "qbItemType" TEXT,
    "qbActive" BOOLEAN NOT NULL DEFAULT true,
    "qbSyncToken" TEXT,
    "rawJson" JSONB,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuickBooksItemCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QuickBooksItemMap_tenantId_integrationId_internalCode_key" ON "QuickBooksItemMap"("tenantId", "integrationId", "internalCode");

-- CreateIndex
CREATE INDEX "QuickBooksItemMap_tenantId_integrationId_qbItemId_idx" ON "QuickBooksItemMap"("tenantId", "integrationId", "qbItemId");

-- CreateIndex
CREATE UNIQUE INDEX "QuickBooksItemCache_tenantId_integrationId_qbItemId_key" ON "QuickBooksItemCache"("tenantId", "integrationId", "qbItemId");

-- CreateIndex
CREATE INDEX "QuickBooksItemCache_tenantId_integrationId_normalizedName_idx" ON "QuickBooksItemCache"("tenantId", "integrationId", "normalizedName");

-- CreateIndex
CREATE INDEX "QuickBooksItemCache_tenantId_integrationId_qbActive_idx" ON "QuickBooksItemCache"("tenantId", "integrationId", "qbActive");

-- AddForeignKey
ALTER TABLE "QuickBooksItemMap" ADD CONSTRAINT "QuickBooksItemMap_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickBooksItemCache" ADD CONSTRAINT "QuickBooksItemCache_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
