-- CreateEnum
CREATE TYPE "WorkOrderProviderSourceType" AS ENUM (
  'direct',
  'third_party_provider'
);

-- CreateTable
CREATE TABLE "WorkOrderProviderContext" (
  "id" TEXT NOT NULL,
  "workOrderId" TEXT NOT NULL,
  "providerAccountId" TEXT,
  "providerContractProfileId" TEXT,
  "siteProviderAssignmentId" TEXT,
  "providerWorkOrderNumber" TEXT,
  "providerReferenceNumber" TEXT,
  "sourceType" "WorkOrderProviderSourceType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "WorkOrderProviderContext_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderProviderContext_workOrderId_key"
ON "WorkOrderProviderContext"("workOrderId");

-- CreateIndex
CREATE INDEX "WorkOrderProviderContext_providerAccountId_idx"
ON "WorkOrderProviderContext"("providerAccountId");

-- CreateIndex
CREATE INDEX "WorkOrderProviderContext_providerContractProfileId_idx"
ON "WorkOrderProviderContext"("providerContractProfileId");

-- CreateIndex
CREATE INDEX "WorkOrderProviderContext_siteProviderAssignmentId_idx"
ON "WorkOrderProviderContext"("siteProviderAssignmentId");

-- AddForeignKey
ALTER TABLE "WorkOrderProviderContext"
ADD CONSTRAINT "WorkOrderProviderContext_workOrderId_fkey"
FOREIGN KEY ("workOrderId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderProviderContext"
ADD CONSTRAINT "WorkOrderProviderContext_providerAccountId_fkey"
FOREIGN KEY ("providerAccountId") REFERENCES "ContractProviderAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderProviderContext"
ADD CONSTRAINT "WorkOrderProviderContext_providerContractProfileId_fkey"
FOREIGN KEY ("providerContractProfileId") REFERENCES "ProviderContractProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderProviderContext"
ADD CONSTRAINT "WorkOrderProviderContext_siteProviderAssignmentId_fkey"
FOREIGN KEY ("siteProviderAssignmentId") REFERENCES "ServiceSiteProviderAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
