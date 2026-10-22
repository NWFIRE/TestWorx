-- SERIAL assigns a stable unique number to existing reports and future inserts.
-- Internal IDs, relationships, signatures and report contents remain unchanged.
ALTER TABLE "InspectionReport" ADD COLUMN "reportNumber" SERIAL NOT NULL;
CREATE UNIQUE INDEX "InspectionReport_reportNumber_key" ON "InspectionReport"("reportNumber");
