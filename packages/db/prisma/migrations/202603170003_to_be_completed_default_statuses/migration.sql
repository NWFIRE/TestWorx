ALTER TABLE "Inspection"
ALTER COLUMN "status" SET DEFAULT 'to_be_completed';

ALTER TABLE "InspectionTask"
ALTER COLUMN "status" SET DEFAULT 'to_be_completed';
