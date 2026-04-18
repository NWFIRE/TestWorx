-- CreateEnum
CREATE TYPE "ContractProviderAccountStatus" AS ENUM (
  'active',
  'inactive'
);

-- CreateEnum
CREATE TYPE "ProviderContractProfileStatus" AS ENUM (
  'draft',
  'active',
  'inactive',
  'expired'
);

-- CreateEnum
CREATE TYPE "ProviderContractPricingStrategy" AS ENUM (
  'provider_rate_card',
  'fixed_price',
  'custom_rules'
);

-- CreateEnum
CREATE TYPE "ProviderInvoiceGroupingMode" AS ENUM (
  'per_work_order',
  'per_site',
  'monthly_rollup'
);

-- CreateEnum
CREATE TYPE "ProviderContractRatePricingMethod" AS ENUM (
  'flat_rate',
  'per_unit',
  'hourly'
);

-- CreateTable
CREATE TABLE "ContractProviderAccount" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "legalName" TEXT,
  "status" "ContractProviderAccountStatus" NOT NULL DEFAULT 'active',
  "billingContactName" TEXT NOT NULL,
  "billingEmail" TEXT NOT NULL,
  "billingPhone" TEXT NOT NULL,
  "remittanceAddressLine1" TEXT NOT NULL,
  "remittanceAddressLine2" TEXT,
  "remittanceCity" TEXT NOT NULL,
  "remittanceState" TEXT NOT NULL,
  "remittancePostalCode" TEXT NOT NULL,
  "paymentTerms" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ContractProviderAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderContractProfile" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "ProviderContractProfileStatus" NOT NULL DEFAULT 'draft',
  "effectiveStartDate" TIMESTAMP(3) NOT NULL,
  "effectiveEndDate" TIMESTAMP(3),
  "pricingStrategy" "ProviderContractPricingStrategy" NOT NULL,
  "invoiceGroupingMode" "ProviderInvoiceGroupingMode" NOT NULL,
  "requireProviderWorkOrderNumber" BOOLEAN NOT NULL DEFAULT false,
  "requireSiteReferenceNumber" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProviderContractProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderContractRate" (
  "id" TEXT NOT NULL,
  "providerContractProfileId" TEXT NOT NULL,
  "serviceType" TEXT NOT NULL,
  "inspectionType" "InspectionType",
  "assetCategory" TEXT,
  "reportType" TEXT,
  "pricingMethod" "ProviderContractRatePricingMethod" NOT NULL,
  "unitRate" DOUBLE PRECISION,
  "flatRate" DOUBLE PRECISION,
  "minimumCharge" DOUBLE PRECISION,
  "effectiveStartDate" TIMESTAMP(3),
  "effectiveEndDate" TIMESTAMP(3),
  "priority" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProviderContractRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractProviderAccount_organizationId_name_key"
ON "ContractProviderAccount"("organizationId", "name");

-- CreateIndex
CREATE INDEX "ContractProviderAccount_organizationId_idx"
ON "ContractProviderAccount"("organizationId");

-- CreateIndex
CREATE INDEX "ContractProviderAccount_organizationId_status_idx"
ON "ContractProviderAccount"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderContractProfile_organizationId_name_key"
ON "ProviderContractProfile"("organizationId", "name");

-- CreateIndex
CREATE INDEX "ProviderContractProfile_organizationId_idx"
ON "ProviderContractProfile"("organizationId");

-- CreateIndex
CREATE INDEX "ProviderContractProfile_providerAccountId_idx"
ON "ProviderContractProfile"("providerAccountId");

-- CreateIndex
CREATE INDEX "ProviderContractProfile_organizationId_status_idx"
ON "ProviderContractProfile"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ProviderContractProfile_organizationId_providerAccountId_idx"
ON "ProviderContractProfile"("organizationId", "providerAccountId");

-- CreateIndex
CREATE INDEX "ProviderContractRate_providerContractProfileId_idx"
ON "ProviderContractRate"("providerContractProfileId");

-- CreateIndex
CREATE INDEX "ProviderContractRate_providerContractProfileId_priority_idx"
ON "ProviderContractRate"("providerContractProfileId", "priority");

-- CreateIndex
CREATE INDEX "ProviderContractRate_providerContractProfileId_serviceType_idx"
ON "ProviderContractRate"("providerContractProfileId", "serviceType");

-- AddForeignKey
ALTER TABLE "ContractProviderAccount"
ADD CONSTRAINT "ContractProviderAccount_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderContractProfile"
ADD CONSTRAINT "ProviderContractProfile_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderContractProfile"
ADD CONSTRAINT "ProviderContractProfile_providerAccountId_fkey"
FOREIGN KEY ("providerAccountId") REFERENCES "ContractProviderAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderContractRate"
ADD CONSTRAINT "ProviderContractRate_providerContractProfileId_fkey"
FOREIGN KEY ("providerContractProfileId") REFERENCES "ProviderContractProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
