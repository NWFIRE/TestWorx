DROP INDEX "InspectionTask_inspectionId_inspectionType_key";

CREATE INDEX "InspectionTask_inspectionId_inspectionType_idx"
ON "InspectionTask"("inspectionId", "inspectionType");
