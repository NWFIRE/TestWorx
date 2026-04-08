-- CreateEnum
CREATE TYPE "QuoteReminderType" AS ENUM (
  'sent_not_viewed_first',
  'sent_not_viewed_second',
  'viewed_pending_first',
  'viewed_pending_second',
  'expiring_soon',
  'expired_follow_up',
  'manual_follow_up'
);

-- CreateEnum
CREATE TYPE "QuoteReminderDispatchStatus" AS ENUM (
  'pending',
  'sent',
  'skipped',
  'failed'
);

-- AlterTable
ALTER TABLE "Tenant"
ADD COLUMN "quoteReminderSettings" JSONB;

-- AlterTable
ALTER TABLE "Quote"
ADD COLUMN "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "remindersPausedAt" TIMESTAMP(3),
ADD COLUMN "remindersPausedByUserId" TEXT,
ADD COLUMN "nextReminderAt" TIMESTAMP(3),
ADD COLUMN "lastReminderAt" TIMESTAMP(3),
ADD COLUMN "reminderStage" TEXT,
ADD COLUMN "reminderCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "reminderError" TEXT;

-- CreateTable
CREATE TABLE "QuoteReminderDispatch" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "reminderType" "QuoteReminderType" NOT NULL,
  "status" "QuoteReminderDispatchStatus" NOT NULL DEFAULT 'pending',
  "dedupeKey" TEXT,
  "recipientEmail" TEXT,
  "scheduledFor" TIMESTAMP(3),
  "attemptedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "messageId" TEXT,
  "error" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "QuoteReminderDispatch_pkey" PRIMARY KEY ("id")
);

-- Backfill
UPDATE "Quote"
SET "remindersEnabled" = true
WHERE "remindersEnabled" IS DISTINCT FROM true;

-- CreateIndex
CREATE UNIQUE INDEX "QuoteReminderDispatch_dedupeKey_key" ON "QuoteReminderDispatch"("dedupeKey");

-- CreateIndex
CREATE INDEX "Quote_tenantId_remindersEnabled_idx" ON "Quote"("tenantId", "remindersEnabled");

-- CreateIndex
CREATE INDEX "Quote_tenantId_nextReminderAt_idx" ON "Quote"("tenantId", "nextReminderAt");

-- CreateIndex
CREATE INDEX "QuoteReminderDispatch_tenantId_quoteId_idx" ON "QuoteReminderDispatch"("tenantId", "quoteId");

-- CreateIndex
CREATE INDEX "QuoteReminderDispatch_tenantId_status_idx" ON "QuoteReminderDispatch"("tenantId", "status");

-- CreateIndex
CREATE INDEX "QuoteReminderDispatch_tenantId_reminderType_idx" ON "QuoteReminderDispatch"("tenantId", "reminderType");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_remindersPausedByUserId_fkey" FOREIGN KEY ("remindersPausedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteReminderDispatch" ADD CONSTRAINT "QuoteReminderDispatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteReminderDispatch" ADD CONSTRAINT "QuoteReminderDispatch_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
