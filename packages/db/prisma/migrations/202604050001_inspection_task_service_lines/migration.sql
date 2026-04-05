-- AlterTable
ALTER TABLE "InspectionTask"
ADD COLUMN     "assignedTechnicianId" TEXT,
ADD COLUMN     "dueMonth" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "schedulingStatus" TEXT NOT NULL DEFAULT 'scheduled_now',
ADD COLUMN     "notes" TEXT;

-- CreateIndex
CREATE INDEX "InspectionTask_tenantId_assignedTechnicianId_idx" ON "InspectionTask"("tenantId", "assignedTechnicianId");

-- CreateIndex
CREATE INDEX "InspectionTask_tenantId_dueMonth_idx" ON "InspectionTask"("tenantId", "dueMonth");

-- CreateIndex
CREATE INDEX "InspectionTask_tenantId_schedulingStatus_idx" ON "InspectionTask"("tenantId", "schedulingStatus");

-- AddForeignKey
ALTER TABLE "InspectionTask"
ADD CONSTRAINT "InspectionTask_assignedTechnicianId_fkey"
FOREIGN KEY ("assignedTechnicianId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
