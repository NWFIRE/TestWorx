DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TimeEntryStatus') THEN
    CREATE TYPE "TimeEntryStatus" AS ENUM ('open', 'closed', 'corrected');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "TimeEntry" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "clockInAt" TIMESTAMP(3) NOT NULL,
  "clockOutAt" TIMESTAMP(3),
  "grossMinutes" INTEGER NOT NULL DEFAULT 0,
  "lunchDeductionMinutes" INTEGER NOT NULL DEFAULT 30,
  "netMinutes" INTEGER NOT NULL DEFAULT 0,
  "status" "TimeEntryStatus" NOT NULL DEFAULT 'open',
  "notes" TEXT,
  "correctionReason" TEXT,
  "correctedByUserId" TEXT,
  "correctedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TimeEntry_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TimeEntry_tenantId_fkey'
  ) THEN
    ALTER TABLE "TimeEntry"
      ADD CONSTRAINT "TimeEntry_tenantId_fkey"
      FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TimeEntry_employeeId_fkey'
  ) THEN
    ALTER TABLE "TimeEntry"
      ADD CONSTRAINT "TimeEntry_employeeId_fkey"
      FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TimeEntry_correctedByUserId_fkey'
  ) THEN
    ALTER TABLE "TimeEntry"
      ADD CONSTRAINT "TimeEntry_correctedByUserId_fkey"
      FOREIGN KEY ("correctedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "TimeEntry_tenantId_employeeId_clockInAt_idx" ON "TimeEntry"("tenantId", "employeeId", "clockInAt");
CREATE INDEX IF NOT EXISTS "TimeEntry_tenantId_status_idx" ON "TimeEntry"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "TimeEntry_tenantId_clockInAt_idx" ON "TimeEntry"("tenantId", "clockInAt");
