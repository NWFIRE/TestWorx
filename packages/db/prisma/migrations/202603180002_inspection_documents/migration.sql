CREATE TYPE "InspectionDocumentType" AS ENUM ('EXTERNAL_CUSTOMER_FORM');

CREATE TYPE "InspectionDocumentStatus" AS ENUM ('UPLOADED', 'READY_FOR_SIGNATURE', 'SIGNED', 'EXPORTED');

CREATE TABLE "InspectionDocument" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER,
  "documentType" "InspectionDocumentType" NOT NULL DEFAULT 'EXTERNAL_CUSTOMER_FORM',
  "label" TEXT,
  "requiresSignature" BOOLEAN NOT NULL DEFAULT false,
  "status" "InspectionDocumentStatus" NOT NULL DEFAULT 'UPLOADED',
  "customerVisible" BOOLEAN NOT NULL DEFAULT false,
  "originalStorageKey" TEXT NOT NULL,
  "signedStorageKey" TEXT,
  "uploadedByUserId" TEXT,
  "signedByUserId" TEXT,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "signedAt" TIMESTAMP(3),
  "exportedAt" TIMESTAMP(3),
  "externalTransferStatus" TEXT,
  "externalTransferRef" TEXT,
  "externalTransferAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "InspectionDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InspectionDocument_tenantId_inspectionId_idx" ON "InspectionDocument"("tenantId", "inspectionId");
CREATE INDEX "InspectionDocument_tenantId_status_idx" ON "InspectionDocument"("tenantId", "status");

ALTER TABLE "InspectionDocument"
ADD CONSTRAINT "InspectionDocument_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InspectionDocument"
ADD CONSTRAINT "InspectionDocument_inspectionId_fkey"
FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
