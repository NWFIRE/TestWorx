CREATE TABLE "JobTimeSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "inspectionId" TEXT NOT NULL REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "technicianId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endedAt" TIMESTAMP(3),
  "endReason" TEXT,
  "needsReview" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobTimeSession_valid_interval" CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt")
);
CREATE INDEX "JobTimeSession_tenantId_inspectionId_startedAt_idx" ON "JobTimeSession"("tenantId", "inspectionId", "startedAt");
CREATE INDEX "JobTimeSession_tenantId_technicianId_startedAt_idx" ON "JobTimeSession"("tenantId", "technicianId", "startedAt");
CREATE UNIQUE INDEX "JobTimeSession_one_active_per_technician" ON "JobTimeSession"("tenantId", "technicianId") WHERE "endedAt" IS NULL;
