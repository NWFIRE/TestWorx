CREATE TYPE "ManualSystemCategory" AS ENUM ('wet_chemical', 'industrial_dry_chemical');
CREATE TYPE "ManualDocumentType" AS ENUM ('installation', 'inspection', 'service', 'owners_manual', 'parts', 'tech_data', 'troubleshooting', 'catalog', 'other');
CREATE TYPE "ManualSearchableTextStatus" AS ENUM ('pending', 'ready', 'failed', 'not_requested');

CREATE TABLE "Manual" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "manufacturer" TEXT NOT NULL,
  "systemCategory" "ManualSystemCategory" NOT NULL,
  "productFamily" TEXT,
  "model" TEXT,
  "documentType" "ManualDocumentType" NOT NULL,
  "revisionLabel" TEXT,
  "revisionDate" TIMESTAMP(3),
  "description" TEXT,
  "notes" TEXT,
  "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "fileId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSizeBytes" INTEGER,
  "pageCount" INTEGER,
  "source" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isOfflineEligible" BOOLEAN NOT NULL DEFAULT false,
  "searchableTextStatus" "ManualSearchableTextStatus" NOT NULL DEFAULT 'not_requested',
  "searchableText" TEXT,
  "supersedesManualId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdByUserId" TEXT,
  "updatedByUserId" TEXT,
  CONSTRAINT "Manual_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ManualApplicability" (
  "id" TEXT NOT NULL,
  "manualId" TEXT NOT NULL,
  "manufacturer" TEXT NOT NULL,
  "productFamily" TEXT,
  "model" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ManualApplicability_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserManualState" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "manualId" TEXT NOT NULL,
  "isFavorite" BOOLEAN NOT NULL DEFAULT false,
  "lastViewedAt" TIMESTAMP(3),
  "savedOfflineAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserManualState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Manual_fileId_key" ON "Manual"("fileId");
CREATE UNIQUE INDEX "Manual_supersedesManualId_key" ON "Manual"("supersedesManualId");
CREATE UNIQUE INDEX "UserManualState_userId_manualId_key" ON "UserManualState"("userId", "manualId");

CREATE INDEX "Manual_tenantId_idx" ON "Manual"("tenantId");
CREATE INDEX "Manual_tenantId_systemCategory_idx" ON "Manual"("tenantId", "systemCategory");
CREATE INDEX "Manual_tenantId_manufacturer_idx" ON "Manual"("tenantId", "manufacturer");
CREATE INDEX "Manual_tenantId_model_idx" ON "Manual"("tenantId", "model");
CREATE INDEX "Manual_tenantId_documentType_idx" ON "Manual"("tenantId", "documentType");
CREATE INDEX "Manual_tenantId_isActive_idx" ON "Manual"("tenantId", "isActive");
CREATE INDEX "Manual_tenantId_revisionDate_idx" ON "Manual"("tenantId", "revisionDate");
CREATE INDEX "ManualApplicability_manualId_idx" ON "ManualApplicability"("manualId");
CREATE INDEX "ManualApplicability_manufacturer_idx" ON "ManualApplicability"("manufacturer");
CREATE INDEX "ManualApplicability_productFamily_idx" ON "ManualApplicability"("productFamily");
CREATE INDEX "ManualApplicability_model_idx" ON "ManualApplicability"("model");
CREATE INDEX "UserManualState_userId_idx" ON "UserManualState"("userId");
CREATE INDEX "UserManualState_manualId_idx" ON "UserManualState"("manualId");

ALTER TABLE "Manual"
  ADD CONSTRAINT "Manual_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Manual"
  ADD CONSTRAINT "Manual_fileId_fkey"
  FOREIGN KEY ("fileId") REFERENCES "Attachment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Manual"
  ADD CONSTRAINT "Manual_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Manual"
  ADD CONSTRAINT "Manual_updatedByUserId_fkey"
  FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Manual"
  ADD CONSTRAINT "Manual_supersedesManualId_fkey"
  FOREIGN KEY ("supersedesManualId") REFERENCES "Manual"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ManualApplicability"
  ADD CONSTRAINT "ManualApplicability_manualId_fkey"
  FOREIGN KEY ("manualId") REFERENCES "Manual"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserManualState"
  ADD CONSTRAINT "UserManualState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserManualState"
  ADD CONSTRAINT "UserManualState_manualId_fkey"
  FOREIGN KEY ("manualId") REFERENCES "Manual"("id") ON DELETE CASCADE ON UPDATE CASCADE;
