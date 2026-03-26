CREATE TABLE "QuickBooksCatalogItemAlias" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "catalogItemId" TEXT NOT NULL,
  "alias" TEXT NOT NULL,
  "normalizedAlias" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "QuickBooksCatalogItemAlias_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingItemCatalogMatch" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "sourceName" TEXT NOT NULL,
  "normalizedSourceName" TEXT NOT NULL,
  "sourceCode" TEXT,
  "sourceCategory" TEXT NOT NULL,
  "sourceReportType" TEXT NOT NULL,
  "sourceSection" TEXT,
  "sourceField" TEXT,
  "catalogItemId" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL,
  "matchMethod" TEXT NOT NULL,
  "confirmedByUserId" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BillingItemCatalogMatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuickBooksCatalogItemAlias_tenantId_normalizedAlias_key"
ON "QuickBooksCatalogItemAlias"("tenantId", "normalizedAlias");

CREATE INDEX "QuickBooksCatalogItemAlias_tenantId_catalogItemId_idx"
ON "QuickBooksCatalogItemAlias"("tenantId", "catalogItemId");

CREATE INDEX "QuickBooksCatalogItemAlias_tenantId_alias_idx"
ON "QuickBooksCatalogItemAlias"("tenantId", "alias");

CREATE UNIQUE INDEX "BillingItemCatalogMatch_tenantId_sourceKey_key"
ON "BillingItemCatalogMatch"("tenantId", "sourceKey");

CREATE INDEX "BillingItemCatalogMatch_tenantId_catalogItemId_idx"
ON "BillingItemCatalogMatch"("tenantId", "catalogItemId");

CREATE INDEX "BillingItemCatalogMatch_tenantId_normalizedSourceName_idx"
ON "BillingItemCatalogMatch"("tenantId", "normalizedSourceName");

ALTER TABLE "QuickBooksCatalogItemAlias"
ADD CONSTRAINT "QuickBooksCatalogItemAlias_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "QuickBooksCatalogItemAlias"
ADD CONSTRAINT "QuickBooksCatalogItemAlias_catalogItemId_fkey"
FOREIGN KEY ("catalogItemId") REFERENCES "QuickBooksCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BillingItemCatalogMatch"
ADD CONSTRAINT "BillingItemCatalogMatch_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "BillingItemCatalogMatch"
ADD CONSTRAINT "BillingItemCatalogMatch_catalogItemId_fkey"
FOREIGN KEY ("catalogItemId") REFERENCES "QuickBooksCatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
