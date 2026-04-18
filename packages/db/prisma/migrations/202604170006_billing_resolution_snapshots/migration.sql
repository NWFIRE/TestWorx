-- CreateEnum
CREATE TYPE "BillingResolutionSourceEntityType" AS ENUM (
  'work_order',
  'report',
  'invoice'
);

-- CreateEnum
CREATE TYPE "BillingResolutionMode" AS ENUM (
  'direct_customer',
  'contract_provider'
);

-- CreateEnum
CREATE TYPE "BillingResolutionPricingSource" AS ENUM (
  'provider_contract_rate',
  'customer_pricing',
  'default_pricing',
  'manual_override'
);

-- CreateTable
CREATE TABLE "BillingResolutionSnapshot" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "sourceEntityType" "BillingResolutionSourceEntityType" NOT NULL,
  "sourceEntityId" TEXT NOT NULL,
  "resolvedMode" "BillingResolutionMode" NOT NULL,
  "payerCustomerId" TEXT,
  "payerProviderAccountId" TEXT,
  "providerContractProfileId" TEXT,
  "siteProviderAssignmentId" TEXT,
  "pricingSource" "BillingResolutionPricingSource" NOT NULL,
  "pricingSourceReferenceId" TEXT,
  "resolutionReason" TEXT,
  "snapshotData" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BillingResolutionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingResolutionSnapshot_organizationId_idx"
ON "BillingResolutionSnapshot"("organizationId");

-- CreateIndex
CREATE INDEX "BillingResolutionSnapshot_organizationId_sourceEntityType_sourceEntityId_idx"
ON "BillingResolutionSnapshot"("organizationId", "sourceEntityType", "sourceEntityId");

-- CreateIndex
CREATE INDEX "BillingResolutionSnapshot_payerCustomerId_idx"
ON "BillingResolutionSnapshot"("payerCustomerId");

-- CreateIndex
CREATE INDEX "BillingResolutionSnapshot_payerProviderAccountId_idx"
ON "BillingResolutionSnapshot"("payerProviderAccountId");

-- CreateIndex
CREATE INDEX "BillingResolutionSnapshot_providerContractProfileId_idx"
ON "BillingResolutionSnapshot"("providerContractProfileId");

-- CreateIndex
CREATE INDEX "BillingResolutionSnapshot_siteProviderAssignmentId_idx"
ON "BillingResolutionSnapshot"("siteProviderAssignmentId");

-- AddForeignKey
ALTER TABLE "BillingResolutionSnapshot"
ADD CONSTRAINT "BillingResolutionSnapshot_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingResolutionSnapshot"
ADD CONSTRAINT "BillingResolutionSnapshot_payerCustomerId_fkey"
FOREIGN KEY ("payerCustomerId") REFERENCES "CustomerCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingResolutionSnapshot"
ADD CONSTRAINT "BillingResolutionSnapshot_payerProviderAccountId_fkey"
FOREIGN KEY ("payerProviderAccountId") REFERENCES "ContractProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingResolutionSnapshot"
ADD CONSTRAINT "BillingResolutionSnapshot_providerContractProfileId_fkey"
FOREIGN KEY ("providerContractProfileId") REFERENCES "ProviderContractProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingResolutionSnapshot"
ADD CONSTRAINT "BillingResolutionSnapshot_siteProviderAssignmentId_fkey"
FOREIGN KEY ("siteProviderAssignmentId") REFERENCES "ServiceSiteProviderAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
