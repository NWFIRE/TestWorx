-- Add support for saved annotated inspection-document variants.
ALTER TYPE "InspectionDocumentStatus" ADD VALUE IF NOT EXISTS 'ANNOTATED';

ALTER TABLE "InspectionDocument"
ADD COLUMN "annotatedStorageKey" TEXT,
ADD COLUMN "annotatedByUserId" TEXT,
ADD COLUMN "annotatedAt" TIMESTAMP(3);
