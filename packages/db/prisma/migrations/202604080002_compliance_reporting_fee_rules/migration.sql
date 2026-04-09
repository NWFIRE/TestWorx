-- CreateEnum
CREATE TYPE "ComplianceReportingDivision" AS ENUM (
  'fire_extinguishers',
  'fire_alarm',
  'fire_sprinkler',
  'kitchen_suppression'
);

-- CreateTable
CREATE TABLE "ComplianceReportingFeeRule" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "division" "ComplianceReportingDivision" NOT NULL,
  "city" TEXT NOT NULL,
  "normalizedCity" TEXT NOT NULL,
  "county" TEXT,
  "normalizedCounty" TEXT NOT NULL DEFAULT '',
  "state" TEXT,
  "normalizedState" TEXT NOT NULL DEFAULT '',
  "feeAmount" DOUBLE PRECISION NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ComplianceReportingFeeRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ComplianceReportingFeeRule_tenantId_active_division_idx"
ON "ComplianceReportingFeeRule"("tenantId", "active", "division");

-- CreateIndex
CREATE INDEX "ComplianceReportingFeeRule_tenantId_normalizedCity_idx"
ON "ComplianceReportingFeeRule"("tenantId", "normalizedCity");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceReportingFeeRule_active_city_division_key"
ON "ComplianceReportingFeeRule"("tenantId", "division", "normalizedCity")
WHERE "active" = true;

-- AddForeignKey
ALTER TABLE "ComplianceReportingFeeRule"
ADD CONSTRAINT "ComplianceReportingFeeRule_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
