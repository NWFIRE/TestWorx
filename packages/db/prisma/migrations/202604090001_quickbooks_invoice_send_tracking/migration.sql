ALTER TABLE "InspectionBillingSummary"
ADD COLUMN "quickbooksSendStatus" TEXT DEFAULT 'not_sent',
ADD COLUMN "quickbooksSentAt" TIMESTAMP(3),
ADD COLUMN "quickbooksSendError" TEXT;

UPDATE "InspectionBillingSummary"
SET
  "quickbooksSendStatus" = CASE
    WHEN "quickbooksSyncStatus" = 'sent' THEN 'sent'
    WHEN "quickbooksInvoiceId" IS NOT NULL AND "quickbooksSyncStatus" = 'failed' THEN 'send_failed'
    ELSE COALESCE("quickbooksSendStatus", 'not_sent')
  END,
  "quickbooksSentAt" = CASE
    WHEN "quickbooksSyncStatus" = 'sent' THEN COALESCE("quickbooksSentAt", "quickbooksSyncedAt")
    ELSE "quickbooksSentAt"
  END,
  "quickbooksSendError" = CASE
    WHEN "quickbooksInvoiceId" IS NOT NULL AND "quickbooksSyncStatus" = 'failed' THEN COALESCE("quickbooksSendError", "quickbooksSyncError")
    ELSE "quickbooksSendError"
  END,
  "quickbooksSyncStatus" = CASE
    WHEN "quickbooksSyncStatus" = 'sent' THEN 'synced'
    WHEN "quickbooksInvoiceId" IS NOT NULL AND "quickbooksSyncStatus" = 'failed' THEN 'synced'
    ELSE "quickbooksSyncStatus"
  END,
  "quickbooksSyncError" = CASE
    WHEN "quickbooksInvoiceId" IS NOT NULL AND "quickbooksSyncStatus" = 'failed' THEN NULL
    ELSE "quickbooksSyncError"
  END;
