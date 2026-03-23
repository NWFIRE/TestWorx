CREATE TABLE "InspectionTechnicianAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InspectionTechnicianAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InspectionTechnicianAssignment_inspectionId_technicianId_key"
ON "InspectionTechnicianAssignment"("inspectionId", "technicianId");

CREATE INDEX "InspectionTechnicianAssignment_tenantId_inspectionId_idx"
ON "InspectionTechnicianAssignment"("tenantId", "inspectionId");

CREATE INDEX "InspectionTechnicianAssignment_tenantId_technicianId_idx"
ON "InspectionTechnicianAssignment"("tenantId", "technicianId");

ALTER TABLE "InspectionTechnicianAssignment"
ADD CONSTRAINT "InspectionTechnicianAssignment_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "InspectionTechnicianAssignment"
ADD CONSTRAINT "InspectionTechnicianAssignment_inspectionId_fkey"
FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InspectionTechnicianAssignment"
ADD CONSTRAINT "InspectionTechnicianAssignment_technicianId_fkey"
FOREIGN KEY ("technicianId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "InspectionTechnicianAssignment" ("id", "tenantId", "inspectionId", "technicianId", "createdAt")
SELECT
  md5("Inspection"."id" || ':' || "Inspection"."assignedTechnicianId"),
  "Inspection"."tenantId",
  "Inspection"."id",
  "Inspection"."assignedTechnicianId",
  CURRENT_TIMESTAMP
FROM "Inspection"
WHERE "Inspection"."assignedTechnicianId" IS NOT NULL
ON CONFLICT ("inspectionId", "technicianId") DO NOTHING;
