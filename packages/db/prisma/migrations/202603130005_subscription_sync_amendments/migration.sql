CREATE TYPE "InspectionAmendmentType" AS ENUM ('reschedule', 'reassignment', 'scope_change');
CREATE TYPE "StripeWebhookEventStatus" AS ENUM ('received', 'processed', 'failed');

ALTER TABLE "Tenant"
  ADD COLUMN "stripePriceId" TEXT,
  ADD COLUMN "stripeCurrentPeriodEndsAt" TIMESTAMP(3),
  ADD COLUMN "stripeCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "InspectionAmendment" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "inspectionId" TEXT NOT NULL,
  "replacementInspectionId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "type" "InspectionAmendmentType" NOT NULL DEFAULT 'reschedule',
  "reason" TEXT NOT NULL,
  "previousSnapshot" JSONB NOT NULL,
  "replacementSnapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InspectionAmendment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StripeWebhookEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT,
  "stripeEventId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "status" "StripeWebhookEventStatus" NOT NULL DEFAULT 'received',
  "payload" JSONB NOT NULL,
  "errorMessage" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StripeWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StripeWebhookEvent_stripeEventId_key" ON "StripeWebhookEvent"("stripeEventId");

ALTER TABLE "InspectionAmendment"
  ADD CONSTRAINT "InspectionAmendment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InspectionAmendment_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InspectionAmendment_replacementInspectionId_fkey" FOREIGN KEY ("replacementInspectionId") REFERENCES "Inspection"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "InspectionAmendment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StripeWebhookEvent"
  ADD CONSTRAINT "StripeWebhookEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;