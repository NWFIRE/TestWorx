ALTER TABLE "Deficiency"
ADD COLUMN "inspectionId" TEXT,
ADD COLUMN "siteId" TEXT,
ADD COLUMN "reportType" "InspectionType",
ADD COLUMN "section" TEXT,
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN "sourceRowKey" TEXT,
ADD COLUMN "assetTag" TEXT,
ADD COLUMN "location" TEXT,
ADD COLUMN "deviceType" TEXT,
ADD COLUMN "photoStorageKey" TEXT,
ADD COLUMN "notes" TEXT;

UPDATE "Deficiency" AS d
SET
  "inspectionId" = r."inspectionId",
  "siteId" = i."siteId",
  "reportType" = t."inspectionType",
  "section" = COALESCE(d."title", 'manual'),
  "sourceRowKey" = d."id"
FROM "InspectionReport" AS r
JOIN "Inspection" AS i ON i."id" = r."inspectionId"
JOIN "InspectionTask" AS t ON t."id" = r."inspectionTaskId"
WHERE d."inspectionReportId" = r."id";

ALTER TABLE "Deficiency"
ALTER COLUMN "inspectionId" SET NOT NULL,
ALTER COLUMN "siteId" SET NOT NULL,
ALTER COLUMN "reportType" SET NOT NULL,
ALTER COLUMN "section" SET NOT NULL,
ALTER COLUMN "sourceRowKey" SET NOT NULL;

ALTER TABLE "Deficiency"
ADD CONSTRAINT "Deficiency_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "Deficiency_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Deficiency_inspectionReportId_source_section_sourceRowKey_key"
ON "Deficiency"("inspectionReportId", "source", "section", "sourceRowKey");

CREATE INDEX "Deficiency_tenantId_status_idx" ON "Deficiency"("tenantId", "status");
CREATE INDEX "Deficiency_tenantId_siteId_idx" ON "Deficiency"("tenantId", "siteId");
CREATE INDEX "Deficiency_tenantId_inspectionId_idx" ON "Deficiency"("tenantId", "inspectionId");
