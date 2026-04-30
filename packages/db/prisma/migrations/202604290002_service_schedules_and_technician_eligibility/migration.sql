-- Add service schedule records that separate long-term service needs from
-- concrete inspection/report tasks.
CREATE TABLE "ServiceSchedule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "customerCompanyId" TEXT NOT NULL,
  "siteId" TEXT NOT NULL,
  "serviceType" "InspectionType" NOT NULL,
  "reportType" "InspectionType" NOT NULL,
  "cadence" "RecurrenceFrequency" NOT NULL,
  "nextDueDate" TIMESTAMP(3),
  "dueMonth" TEXT,
  "dueDayOrWindow" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServiceSchedule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServiceSchedule_tenantId_customerCompanyId_siteId_idx"
  ON "ServiceSchedule"("tenantId", "customerCompanyId", "siteId");

CREATE INDEX "ServiceSchedule_tenantId_siteId_dueMonth_idx"
  ON "ServiceSchedule"("tenantId", "siteId", "dueMonth");

CREATE INDEX "ServiceSchedule_tenantId_reportType_isActive_idx"
  ON "ServiceSchedule"("tenantId", "reportType", "isActive");

ALTER TABLE "ServiceSchedule"
  ADD CONSTRAINT "ServiceSchedule_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceSchedule"
  ADD CONSTRAINT "ServiceSchedule_customerCompanyId_fkey"
  FOREIGN KEY ("customerCompanyId") REFERENCES "CustomerCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ServiceSchedule"
  ADD CONSTRAINT "ServiceSchedule_siteId_fkey"
  FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Technician eligibility controls which report types a technician can be
-- assigned or claim from the shared queue.
CREATE TABLE "TechnicianReportTypeEligibility" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "technicianUserId" TEXT NOT NULL,
  "reportType" "InspectionType" NOT NULL,
  "canBeAssigned" BOOLEAN NOT NULL DEFAULT true,
  "canClaim" BOOLEAN NOT NULL DEFAULT true,
  "licenseRequired" BOOLEAN NOT NULL DEFAULT false,
  "licenseNumber" TEXT,
  "expiresAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TechnicianReportTypeEligibility_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TechnicianReportTypeEligibility_tenantId_technicianUserId_reportType_key"
  ON "TechnicianReportTypeEligibility"("tenantId", "technicianUserId", "reportType");

CREATE INDEX "TechnicianReportTypeEligibility_tenantId_reportType_idx"
  ON "TechnicianReportTypeEligibility"("tenantId", "reportType");

CREATE INDEX "TechnicianReportTypeEligibility_tenantId_technicianUserId_idx"
  ON "TechnicianReportTypeEligibility"("tenantId", "technicianUserId");

ALTER TABLE "TechnicianReportTypeEligibility"
  ADD CONSTRAINT "TechnicianReportTypeEligibility_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TechnicianReportTypeEligibility"
  ADD CONSTRAINT "TechnicianReportTypeEligibility_technicianUserId_fkey"
  FOREIGN KEY ("technicianUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InspectionTask" ADD COLUMN "serviceScheduleId" TEXT;

CREATE INDEX "InspectionTask_tenantId_serviceScheduleId_idx"
  ON "InspectionTask"("tenantId", "serviceScheduleId");

ALTER TABLE "InspectionTask"
  ADD CONSTRAINT "InspectionTask_serviceScheduleId_fkey"
  FOREIGN KEY ("serviceScheduleId") REFERENCES "ServiceSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
