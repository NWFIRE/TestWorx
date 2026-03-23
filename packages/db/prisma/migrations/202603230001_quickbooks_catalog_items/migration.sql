CREATE TABLE "QuickBooksCatalogItem" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "quickbooksItemId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sku" TEXT,
  "itemType" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "unitPrice" DOUBLE PRECISION,
  "incomeAccountId" TEXT,
  "incomeAccountName" TEXT,
  "rawJson" JSONB,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "QuickBooksCatalogItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuickBooksCatalogItem_tenantId_quickbooksItemId_key" ON "QuickBooksCatalogItem"("tenantId", "quickbooksItemId");
CREATE INDEX "QuickBooksCatalogItem_tenantId_active_itemType_idx" ON "QuickBooksCatalogItem"("tenantId", "active", "itemType");
CREATE INDEX "QuickBooksCatalogItem_tenantId_name_idx" ON "QuickBooksCatalogItem"("tenantId", "name");
CREATE INDEX "QuickBooksCatalogItem_tenantId_sku_idx" ON "QuickBooksCatalogItem"("tenantId", "sku");

ALTER TABLE "QuickBooksCatalogItem"
ADD CONSTRAINT "QuickBooksCatalogItem_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
