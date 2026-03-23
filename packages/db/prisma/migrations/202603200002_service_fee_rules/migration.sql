ALTER TABLE "Tenant"
ADD COLUMN "defaultServiceFeeCode" TEXT DEFAULT 'SERVICE_FEE',
ADD COLUMN "defaultServiceFeeUnitPrice" DOUBLE PRECISION;

CREATE TABLE "ServiceFeeRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerCompanyId" TEXT,
  "siteId" TEXT,
  "city" TEXT,
  "state" TEXT,
  "zipCode" TEXT,
  "feeCode" TEXT NOT NULL DEFAULT 'SERVICE_FEE',
  "unitPrice" DOUBLE PRECISION NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceFeeRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServiceFeeRule_tenantId_isActive_priority_idx" ON "ServiceFeeRule"("tenantId", "isActive", "priority");
CREATE INDEX "ServiceFeeRule_tenantId_customerCompanyId_idx" ON "ServiceFeeRule"("tenantId", "customerCompanyId");
CREATE INDEX "ServiceFeeRule_tenantId_siteId_idx" ON "ServiceFeeRule"("tenantId", "siteId");
CREATE INDEX "ServiceFeeRule_tenantId_zipCode_idx" ON "ServiceFeeRule"("tenantId", "zipCode");
CREATE INDEX "ServiceFeeRule_tenantId_city_state_idx" ON "ServiceFeeRule"("tenantId", "city", "state");

ALTER TABLE "ServiceFeeRule"
ADD CONSTRAINT "ServiceFeeRule_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ServiceFeeRule"
ADD CONSTRAINT "ServiceFeeRule_customerCompanyId_fkey"
FOREIGN KEY ("customerCompanyId") REFERENCES "CustomerCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ServiceFeeRule"
ADD CONSTRAINT "ServiceFeeRule_siteId_fkey"
FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
