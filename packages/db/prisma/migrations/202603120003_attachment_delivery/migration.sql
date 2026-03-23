CREATE TYPE "AttachmentSource" AS ENUM ('uploaded', 'generated');

ALTER TABLE "Attachment"
ADD COLUMN "inspectionId" TEXT,
ADD COLUMN "source" "AttachmentSource" NOT NULL DEFAULT 'uploaded',
ADD COLUMN "customerVisible" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Attachment"
ADD CONSTRAINT "Attachment_inspectionId_fkey"
FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE SET NULL ON UPDATE CASCADE;