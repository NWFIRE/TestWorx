ALTER TABLE "Inspection"
  ADD COLUMN "completedAt" TIMESTAMP(3),
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archiveCustomerName" TEXT,
  ADD COLUMN "archiveSiteName" TEXT,
  ADD COLUMN "archiveSiteAddress" TEXT,
  ADD COLUMN "archiveSiteCity" TEXT,
  ADD COLUMN "archiveTechnicianName" TEXT,
  ADD COLUMN "archiveResultStatus" TEXT,
  ADD COLUMN "archiveInspectionTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "archiveDivisions" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "archiveHasDeficiencies" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archiveDeficiencyCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "archiveHasReport" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Inspection" i
SET
  "completedAt" = i."updatedAt",
  "archivedAt" = i."updatedAt",
  "archiveCustomerName" = cc."name",
  "archiveSiteName" = s."name",
  "archiveSiteAddress" = CONCAT_WS(', ',
    NULLIF(TRIM(COALESCE(s."addressLine1", '')), ''),
    NULLIF(TRIM(COALESCE(s."addressLine2", '')), ''),
    NULLIF(TRIM(CONCAT_WS(' ', s."city", s."state", s."postalCode")), '')
  ),
  "archiveSiteCity" = s."city",
  "archiveTechnicianName" = COALESCE(
    assigned."name",
    (
      SELECT STRING_AGG(DISTINCT tech."name", ', ' ORDER BY tech."name")
      FROM "InspectionTechnicianAssignment" ita
      JOIN "User" tech ON tech."id" = ita."technicianId"
      WHERE ita."inspectionId" = i."id"
    )
  ),
  "archiveResultStatus" = CASE
    WHEN EXISTS (
      SELECT 1
      FROM "Deficiency" d
      WHERE d."inspectionId" = i."id" AND LOWER(COALESCE(d."status", '')) <> 'resolved'
    ) THEN 'Deficiencies found'
    WHEN i."status" = 'invoiced' THEN 'Invoiced'
    ELSE 'Completed'
  END,
  "archiveInspectionTypes" = COALESCE(
    (
      SELECT ARRAY_AGG(DISTINCT task."inspectionType"::TEXT ORDER BY task."inspectionType"::TEXT)
      FROM "InspectionTask" task
      WHERE task."inspectionId" = i."id"
    ),
    ARRAY[]::TEXT[]
  ),
  "archiveDivisions" = COALESCE(
    (
      SELECT ARRAY_AGG(DISTINCT division ORDER BY division)
      FROM (
        SELECT CASE
          WHEN task."inspectionType" = 'fire_extinguisher' THEN 'fire_extinguishers'
          WHEN task."inspectionType" = 'fire_alarm' THEN 'fire_alarm'
          WHEN task."inspectionType" IN ('wet_fire_sprinkler', 'dry_fire_sprinkler', 'joint_commission_fire_sprinkler') THEN 'fire_sprinkler'
          WHEN task."inspectionType" = 'kitchen_suppression' THEN 'kitchen_suppression'
          WHEN task."inspectionType" = 'work_order' THEN 'work_order'
          ELSE REPLACE(task."inspectionType"::TEXT, '_', ' ')
        END AS division
        FROM "InspectionTask" task
        WHERE task."inspectionId" = i."id"
      ) divisions
    ),
    ARRAY[]::TEXT[]
  ),
  "archiveDeficiencyCount" = COALESCE(
    (
      SELECT COUNT(*)
      FROM "Deficiency" d
      WHERE d."inspectionId" = i."id"
    ),
    0
  ),
  "archiveHasDeficiencies" = EXISTS(
    SELECT 1
    FROM "Deficiency" d
    WHERE d."inspectionId" = i."id"
  ),
  "archiveHasReport" = EXISTS(
    SELECT 1
    FROM "InspectionReport" r
    WHERE r."inspectionId" = i."id"
  )
FROM "CustomerCompany" cc
JOIN "Site" s ON s."id" = i."siteId"
LEFT JOIN "User" assigned ON assigned."id" = i."assignedTechnicianId"
WHERE cc."id" = i."customerCompanyId"
  AND i."status" IN ('completed', 'invoiced');

CREATE INDEX "Inspection_tenantId_archivedAt_idx" ON "Inspection"("tenantId", "archivedAt");
CREATE INDEX "Inspection_tenantId_completedAt_idx" ON "Inspection"("tenantId", "completedAt");
CREATE INDEX "Inspection_tenantId_archiveCustomerName_idx" ON "Inspection"("tenantId", "archiveCustomerName");
CREATE INDEX "Inspection_tenantId_archiveSiteName_idx" ON "Inspection"("tenantId", "archiveSiteName");
CREATE INDEX "Inspection_tenantId_archiveSiteCity_idx" ON "Inspection"("tenantId", "archiveSiteCity");
CREATE INDEX "Inspection_tenantId_archiveTechnicianName_idx" ON "Inspection"("tenantId", "archiveTechnicianName");
