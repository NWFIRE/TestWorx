-- CreateEnum
CREATE TYPE "BillingType" AS ENUM (
  'standard',
  'third_party'
);

-- CreateTable
CREATE TABLE "BillingPayerAccount" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "contactName" TEXT,
  "billingEmail" TEXT,
  "phone" TEXT,
  "billingAddressLine1" TEXT,
  "billingAddressLine2" TEXT,
  "billingCity" TEXT,
  "billingState" TEXT,
  "billingPostalCode" TEXT,
  "billingCountry" TEXT,
  "invoiceDeliverySettings" JSONB,
  "quickbooksCustomerId" TEXT,
  "externalAccountCode" TEXT,
  "externalReference" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BillingPayerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingContractProfile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "payerAccountId" TEXT,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "effectiveStartDate" TIMESTAMP(3) NOT NULL,
  "effectiveEndDate" TIMESTAMP(3),
  "inspectionRules" JSONB,
  "serviceRules" JSONB,
  "emergencyRules" JSONB,
  "deficiencyRules" JSONB,
  "groupingRules" JSONB,
  "attachmentRules" JSONB,
  "deliveryRules" JSONB,
  "referenceRules" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BillingContractProfile_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "CustomerCompany"
ADD COLUMN "billingType" "BillingType" NOT NULL DEFAULT 'standard',
ADD COLUMN "billToAccountId" TEXT,
ADD COLUMN "contractProfileId" TEXT,
ADD COLUMN "invoiceDeliverySettings" JSONB,
ADD COLUMN "autoBillingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "requiredBillingReferences" JSONB;

-- AlterTable
ALTER TABLE "InspectionBillingSummary"
ADD COLUMN "billingType" "BillingType" NOT NULL DEFAULT 'standard',
ADD COLUMN "billToAccountId" TEXT,
ADD COLUMN "billToName" TEXT,
ADD COLUMN "contractProfileId" TEXT,
ADD COLUMN "contractProfileName" TEXT,
ADD COLUMN "routingSnapshot" JSONB,
ADD COLUMN "pricingSnapshot" JSONB,
ADD COLUMN "groupingSnapshot" JSONB,
ADD COLUMN "attachmentSnapshot" JSONB,
ADD COLUMN "deliverySnapshot" JSONB,
ADD COLUMN "referenceSnapshot" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "BillingPayerAccount_tenantId_name_key"
ON "BillingPayerAccount"("tenantId", "name");

-- CreateIndex
CREATE INDEX "BillingPayerAccount_tenantId_isActive_idx"
ON "BillingPayerAccount"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "BillingContractProfile_tenantId_name_key"
ON "BillingContractProfile"("tenantId", "name");

-- CreateIndex
CREATE INDEX "BillingContractProfile_tenantId_isActive_effectiveStartDate_idx"
ON "BillingContractProfile"("tenantId", "isActive", "effectiveStartDate");

-- CreateIndex
CREATE INDEX "BillingContractProfile_tenantId_payerAccountId_idx"
ON "BillingContractProfile"("tenantId", "payerAccountId");

-- CreateIndex
CREATE INDEX "CustomerCompany_tenantId_billingType_idx"
ON "CustomerCompany"("tenantId", "billingType");

-- CreateIndex
CREATE INDEX "CustomerCompany_tenantId_billToAccountId_idx"
ON "CustomerCompany"("tenantId", "billToAccountId");

-- CreateIndex
CREATE INDEX "CustomerCompany_tenantId_contractProfileId_idx"
ON "CustomerCompany"("tenantId", "contractProfileId");

-- CreateIndex
CREATE INDEX "InspectionBillingSummary_tenantId_billingType_idx"
ON "InspectionBillingSummary"("tenantId", "billingType");

-- CreateIndex
CREATE INDEX "InspectionBillingSummary_tenantId_billToAccountId_idx"
ON "InspectionBillingSummary"("tenantId", "billToAccountId");

-- CreateIndex
CREATE INDEX "InspectionBillingSummary_tenantId_contractProfileId_idx"
ON "InspectionBillingSummary"("tenantId", "contractProfileId");

-- AddForeignKey
ALTER TABLE "BillingPayerAccount"
ADD CONSTRAINT "BillingPayerAccount_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingContractProfile"
ADD CONSTRAINT "BillingContractProfile_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingContractProfile"
ADD CONSTRAINT "BillingContractProfile_payerAccountId_fkey"
FOREIGN KEY ("payerAccountId") REFERENCES "BillingPayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCompany"
ADD CONSTRAINT "CustomerCompany_billToAccountId_fkey"
FOREIGN KEY ("billToAccountId") REFERENCES "BillingPayerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerCompany"
ADD CONSTRAINT "CustomerCompany_contractProfileId_fkey"
FOREIGN KEY ("contractProfileId") REFERENCES "BillingContractProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
