CREATE TYPE "ReportCorrectionState" AS ENUM ('none', 'admin_edit_in_progress', 'reissued_to_technician');

ALTER TABLE "InspectionReport"
ADD COLUMN "correctionState" "ReportCorrectionState" NOT NULL DEFAULT 'none',
ADD COLUMN "correctionReason" TEXT,
ADD COLUMN "correctionRequestedAt" TIMESTAMP(3),
ADD COLUMN "correctionRequestedByUserId" TEXT,
ADD COLUMN "correctionResolvedAt" TIMESTAMP(3),
ADD COLUMN "correctionResolvedByUserId" TEXT;

CREATE TABLE "ReportCorrectionEvent" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "actionType" TEXT NOT NULL,
  "reason" TEXT,
  "previousStatus" TEXT,
  "newStatus" TEXT,
  "snapshotJson" JSONB,
  "actedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReportCorrectionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InspectionReport_tenantId_correctionState_idx" ON "InspectionReport"("tenantId", "correctionState");
CREATE INDEX "ReportCorrectionEvent_tenantId_reportId_idx" ON "ReportCorrectionEvent"("tenantId", "reportId");
CREATE INDEX "ReportCorrectionEvent_tenantId_createdAt_idx" ON "ReportCorrectionEvent"("tenantId", "createdAt");

ALTER TABLE "InspectionReport"
ADD CONSTRAINT "InspectionReport_correctionRequestedByUserId_fkey"
FOREIGN KEY ("correctionRequestedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InspectionReport"
ADD CONSTRAINT "InspectionReport_correctionResolvedByUserId_fkey"
FOREIGN KEY ("correctionResolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReportCorrectionEvent"
ADD CONSTRAINT "ReportCorrectionEvent_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReportCorrectionEvent"
ADD CONSTRAINT "ReportCorrectionEvent_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "InspectionReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportCorrectionEvent"
ADD CONSTRAINT "ReportCorrectionEvent_actedByUserId_fkey"
FOREIGN KEY ("actedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
