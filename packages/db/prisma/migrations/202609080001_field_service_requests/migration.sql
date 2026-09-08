CREATE TYPE "FieldServiceRequestType" AS ENUM ('service_ticket', 'work_order', 'follow_up', 'quote_request', 'other');
CREATE TYPE "FieldServiceRequestPriority" AS ENUM ('normal', 'urgent');
CREATE TYPE "FieldServiceRequestStatus" AS ENUM ('pending', 'acknowledged', 'resolved', 'declined');

CREATE TABLE "FieldServiceRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "customerCompanyId" TEXT NOT NULL,
    "siteId" TEXT,
    "requestType" "FieldServiceRequestType" NOT NULL,
    "priority" "FieldServiceRequestPriority" NOT NULL DEFAULT 'normal',
    "status" "FieldServiceRequestStatus" NOT NULL DEFAULT 'pending',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "equipmentContext" TEXT,
    "preferredTiming" TEXT,
    "adminNote" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FieldServiceRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FieldServiceRequest_tenantId_status_createdAt_idx" ON "FieldServiceRequest"("tenantId", "status", "createdAt");
CREATE INDEX "FieldServiceRequest_tenantId_requestedByUserId_createdAt_idx" ON "FieldServiceRequest"("tenantId", "requestedByUserId", "createdAt");
CREATE INDEX "FieldServiceRequest_tenantId_customerCompanyId_idx" ON "FieldServiceRequest"("tenantId", "customerCompanyId");

ALTER TABLE "FieldServiceRequest" ADD CONSTRAINT "FieldServiceRequest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FieldServiceRequest" ADD CONSTRAINT "FieldServiceRequest_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FieldServiceRequest" ADD CONSTRAINT "FieldServiceRequest_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FieldServiceRequest" ADD CONSTRAINT "FieldServiceRequest_customerCompanyId_fkey" FOREIGN KEY ("customerCompanyId") REFERENCES "CustomerCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FieldServiceRequest" ADD CONSTRAINT "FieldServiceRequest_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE SET NULL ON UPDATE CASCADE;
