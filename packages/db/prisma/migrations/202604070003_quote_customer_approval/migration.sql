ALTER TABLE "Quote"
ADD COLUMN "lastSentAt" TIMESTAMP(3),
ADD COLUMN "resendCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "firstViewedAt" TIMESTAMP(3),
ADD COLUMN "lastViewedAt" TIMESTAMP(3),
ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "customerResponseNote" TEXT,
ADD COLUMN "lastAccessedByEmail" TEXT,
ADD COLUMN "quoteAccessToken" TEXT,
ADD COLUMN "quoteAccessTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "quoteAccessTokenRevokedAt" TIMESTAMP(3),
ADD COLUMN "quoteAccessTokenSentToEmail" TEXT;

UPDATE "Quote"
SET
  "firstViewedAt" = COALESCE("firstViewedAt", "viewedAt"),
  "lastSentAt" = COALESCE("lastSentAt", "sentAt"),
  "resendCount" = COALESCE("resendCount", 0),
  "viewCount" = COALESCE("viewCount", 0);

CREATE UNIQUE INDEX "Quote_quoteAccessToken_key" ON "Quote"("quoteAccessToken");
