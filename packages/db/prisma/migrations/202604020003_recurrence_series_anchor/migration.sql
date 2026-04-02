ALTER TABLE "InspectionRecurrence"
ADD COLUMN "seriesId" TEXT,
ADD COLUMN "anchorScheduledStart" TIMESTAMP(3);

UPDATE "InspectionRecurrence" recurrence
SET
  "seriesId" = recurrence."id",
  "anchorScheduledStart" = inspection."scheduledStart"
FROM "InspectionTask" task
INNER JOIN "Inspection" inspection ON inspection."id" = task."inspectionId"
WHERE task."id" = recurrence."inspectionTaskId";

ALTER TABLE "InspectionRecurrence"
ALTER COLUMN "seriesId" SET NOT NULL;

CREATE INDEX "InspectionRecurrence_tenantId_seriesId_idx" ON "InspectionRecurrence"("tenantId", "seriesId");
