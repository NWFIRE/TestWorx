CREATE TABLE "SignupRateLimit" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "windowStart" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "hits" INTEGER NOT NULL
);
CREATE INDEX "SignupRateLimit_expiresAt_idx" ON "SignupRateLimit"("expiresAt");
