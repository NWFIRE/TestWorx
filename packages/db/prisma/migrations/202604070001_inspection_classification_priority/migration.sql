CREATE TYPE "InspectionClassification" AS ENUM (
  'standard',
  'call_in',
  'follow_up',
  'emergency'
);

ALTER TABLE "Inspection"
ADD COLUMN "inspectionClassification" "InspectionClassification" NOT NULL DEFAULT 'standard',
ADD COLUMN "isPriority" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "priorityAssignedAt" TIMESTAMP(3),
ADD COLUMN "priorityClearedAt" TIMESTAMP(3),
ADD COLUMN "classificationUpdatedAt" TIMESTAMP(3);

CREATE INDEX "Inspection_tenantId_inspectionClassification_idx"
ON "Inspection"("tenantId", "inspectionClassification");

CREATE INDEX "Inspection_tenantId_isPriority_idx"
ON "Inspection"("tenantId", "isPriority");
