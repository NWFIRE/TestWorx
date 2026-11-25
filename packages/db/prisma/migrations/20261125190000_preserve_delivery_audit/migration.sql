ALTER TABLE "ReportDelivery" ALTER COLUMN "attachmentId" DROP NOT NULL;
ALTER TABLE "ReportDelivery" DROP CONSTRAINT "ReportDelivery_attachmentId_fkey";
ALTER TABLE "ReportDelivery" ADD CONSTRAINT "ReportDelivery_attachmentId_fkey"
FOREIGN KEY ("attachmentId") REFERENCES "Attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
