ALTER TABLE "InspectionTask"
ADD COLUMN IF NOT EXISTS "addedByUserId" TEXT;

ALTER TABLE "InspectionTask"
ADD CONSTRAINT "InspectionTask_addedByUserId_fkey"
FOREIGN KEY ("addedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "InspectionTask_addedByUserId_idx" ON "InspectionTask"("addedByUserId");
