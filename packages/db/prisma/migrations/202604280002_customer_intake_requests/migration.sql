CREATE TYPE "CustomerIntakeStatus" AS ENUM (
  'draft',
  'sent',
  'submitted',
  'approved',
  'rejected',
  'expired'
);

ALTER TABLE "Tenant"
ADD COLUMN "customerIntakeAutoCreateEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "CustomerIntakeRequest" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "recipientEmail" TEXT NOT NULL,
  "recipientName" TEXT,
  "status" "CustomerIntakeStatus" NOT NULL DEFAULT 'draft',
  "sentAt" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "approvedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "optionalMessage" TEXT,
  "submittedDataJson" JSONB,
  "createdCustomerId" TEXT,
  "createdSiteId" TEXT,
  "createdWorkOrderId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerIntakeRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerIntakeAttachment" (
  "id" TEXT NOT NULL,
  "intakeRequestId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "fileSizeBytes" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CustomerIntakeAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomerIntakeRequest_tokenHash_key"
ON "CustomerIntakeRequest"("tokenHash");

CREATE INDEX "CustomerIntakeRequest_organizationId_status_createdAt_idx"
ON "CustomerIntakeRequest"("organizationId", "status", "createdAt");

CREATE INDEX "CustomerIntakeRequest_organizationId_recipientEmail_idx"
ON "CustomerIntakeRequest"("organizationId", "recipientEmail");

CREATE INDEX "CustomerIntakeRequest_organizationId_expiresAt_idx"
ON "CustomerIntakeRequest"("organizationId", "expiresAt");

CREATE INDEX "CustomerIntakeAttachment_intakeRequestId_idx"
ON "CustomerIntakeAttachment"("intakeRequestId");

ALTER TABLE "CustomerIntakeRequest"
ADD CONSTRAINT "CustomerIntakeRequest_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerIntakeRequest"
ADD CONSTRAINT "CustomerIntakeRequest_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CustomerIntakeRequest"
ADD CONSTRAINT "CustomerIntakeRequest_approvedByUserId_fkey"
FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomerIntakeAttachment"
ADD CONSTRAINT "CustomerIntakeAttachment_intakeRequestId_fkey"
FOREIGN KEY ("intakeRequestId") REFERENCES "CustomerIntakeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
