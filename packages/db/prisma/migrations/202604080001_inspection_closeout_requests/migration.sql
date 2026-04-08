-- CreateEnum
CREATE TYPE "InspectionCloseoutRequestType" AS ENUM (
  'new_inspection',
  'follow_up_inspection'
);

-- CreateEnum
CREATE TYPE "InspectionCloseoutRequestStatus" AS ENUM (
  'pending',
  'approved',
  'dismissed'
);

-- CreateTable
CREATE TABLE "InspectionCloseoutRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "requestType" "InspectionCloseoutRequestType" NOT NULL,
  "note" TEXT NOT NULL,
  "status" "InspectionCloseoutRequestStatus" NOT NULL DEFAULT 'pending',
  "createdInspectionId" TEXT,
  "approvedByUserId" TEXT,
  "dismissedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InspectionCloseoutRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InspectionCloseoutRequest_inspectionId_key" ON "InspectionCloseoutRequest"("inspectionId");

-- CreateIndex
CREATE INDEX "InspectionCloseoutRequest_tenantId_status_idx" ON "InspectionCloseoutRequest"("tenantId", "status");

-- CreateIndex
CREATE INDEX "InspectionCloseoutRequest_tenantId_requestType_idx" ON "InspectionCloseoutRequest"("tenantId", "requestType");

-- CreateIndex
CREATE INDEX "InspectionCloseoutRequest_tenantId_createdInspectionId_idx" ON "InspectionCloseoutRequest"("tenantId", "createdInspectionId");

-- AddForeignKey
ALTER TABLE "InspectionCloseoutRequest" ADD CONSTRAINT "InspectionCloseoutRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionCloseoutRequest" ADD CONSTRAINT "InspectionCloseoutRequest_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionCloseoutRequest" ADD CONSTRAINT "InspectionCloseoutRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionCloseoutRequest" ADD CONSTRAINT "InspectionCloseoutRequest_createdInspectionId_fkey" FOREIGN KEY ("createdInspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionCloseoutRequest" ADD CONSTRAINT "InspectionCloseoutRequest_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionCloseoutRequest" ADD CONSTRAINT "InspectionCloseoutRequest_dismissedByUserId_fkey" FOREIGN KEY ("dismissedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
