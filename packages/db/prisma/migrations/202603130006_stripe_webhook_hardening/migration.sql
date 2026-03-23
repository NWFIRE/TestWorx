ALTER TYPE "StripeWebhookEventStatus" ADD VALUE IF NOT EXISTS 'processing';

ALTER TABLE "Tenant"
  ADD COLUMN "stripeSubscriptionSyncedAt" TIMESTAMP(3),
  ADD COLUMN "stripeSubscriptionEventCreatedAt" TIMESTAMP(3),
  ADD COLUMN "stripeSubscriptionEventId" TEXT;

ALTER TABLE "StripeWebhookEvent"
  ADD COLUMN "deliveryCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "stripeCreatedAt" TIMESTAMP(3),
  ADD COLUMN "stripeObjectId" TEXT,
  ADD COLUMN "processingStartedAt" TIMESTAMP(3);

CREATE INDEX "StripeWebhookEvent_stripeObjectId_idx" ON "StripeWebhookEvent"("stripeObjectId");
CREATE INDEX "StripeWebhookEvent_type_status_idx" ON "StripeWebhookEvent"("type", "status");
