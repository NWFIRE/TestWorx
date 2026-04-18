-- CreateEnum
CREATE TYPE "ServiceSiteProviderAssignmentStatus" AS ENUM (
  'active',
  'inactive'
);

-- CreateTable
CREATE TABLE "ServiceSiteProviderAssignment" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "serviceSiteId" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "providerContractProfileId" TEXT,
  "status" "ServiceSiteProviderAssignmentStatus" NOT NULL DEFAULT 'active',
  "externalAccountName" TEXT,
  "externalAccountNumber" TEXT,
  "externalLocationCode" TEXT,
  "effectiveStartDate" TIMESTAMP(3),
  "effectiveEndDate" TIMESTAMP(3),
  "billingNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ServiceSiteProviderAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceSiteProviderAssignment_organizationId_idx"
ON "ServiceSiteProviderAssignment"("organizationId");

-- CreateIndex
CREATE INDEX "ServiceSiteProviderAssignment_serviceSiteId_idx"
ON "ServiceSiteProviderAssignment"("serviceSiteId");

-- CreateIndex
CREATE INDEX "ServiceSiteProviderAssignment_providerAccountId_idx"
ON "ServiceSiteProviderAssignment"("providerAccountId");

-- CreateIndex
CREATE INDEX "ServiceSiteProviderAssignment_providerContractProfileId_idx"
ON "ServiceSiteProviderAssignment"("providerContractProfileId");

-- CreateIndex
CREATE INDEX "ServiceSiteProviderAssignment_organizationId_serviceSiteId_idx"
ON "ServiceSiteProviderAssignment"("organizationId", "serviceSiteId");

-- CreateIndex
CREATE INDEX "ServiceSiteProviderAssignment_organizationId_status_idx"
ON "ServiceSiteProviderAssignment"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "ServiceSiteProviderAssignment"
ADD CONSTRAINT "ServiceSiteProviderAssignment_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSiteProviderAssignment"
ADD CONSTRAINT "ServiceSiteProviderAssignment_serviceSiteId_fkey"
FOREIGN KEY ("serviceSiteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSiteProviderAssignment"
ADD CONSTRAINT "ServiceSiteProviderAssignment_providerAccountId_fkey"
FOREIGN KEY ("providerAccountId") REFERENCES "ContractProviderAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSiteProviderAssignment"
ADD CONSTRAINT "ServiceSiteProviderAssignment_providerContractProfileId_fkey"
FOREIGN KEY ("providerContractProfileId") REFERENCES "ProviderContractProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
