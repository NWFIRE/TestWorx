-- Make compliance reporting fee rules match by city/state/ZIP instead of city alone.
ALTER TABLE "ComplianceReportingFeeRule"
ADD COLUMN "zipCode" TEXT,
ADD COLUMN "normalizedZipCode" TEXT NOT NULL DEFAULT '';

ALTER TABLE "ComplianceReportingFeeRule"
ALTER COLUMN "city" DROP NOT NULL,
ALTER COLUMN "normalizedCity" SET DEFAULT '';

DROP INDEX IF EXISTS "ComplianceReportingFeeRule_active_city_division_key";

CREATE INDEX "ComplianceReportingFeeRule_tenantId_normalizedZipCode_idx"
ON "ComplianceReportingFeeRule"("tenantId", "normalizedZipCode");

CREATE INDEX "ComplianceReportingFeeRule_tenantId_active_division_zip_idx"
ON "ComplianceReportingFeeRule"("tenantId", "active", "division", "normalizedZipCode");

CREATE UNIQUE INDEX "ComplianceReportingFeeRule_active_jurisdiction_division_key"
ON "ComplianceReportingFeeRule"(
  "tenantId",
  "division",
  "normalizedCity",
  "normalizedCounty",
  "normalizedState",
  "normalizedZipCode"
)
WHERE "active" = true;
