CREATE TYPE "TechnicianNotificationType" AS ENUM (
  'priority_inspection_assigned',
  'inspection_reissued_for_correction',
  'work_order_reassigned',
  'inspection_overdue',
  'sync_attention_required'
);

CREATE TYPE "TechnicianNotificationPriority" AS ENUM (
  'normal',
  'high',
  'urgent'
);

CREATE TYPE "TechnicianNotificationRelatedEntityType" AS ENUM (
  'work_order',
  'inspection',
  'report',
  'sync_item'
);

CREATE TYPE "MobileDevicePlatform" AS ENUM (
  'ios',
  'android'
);

CREATE TABLE "TechnicianNotification" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "TechnicianNotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "relatedEntityType" "TechnicianNotificationRelatedEntityType" NOT NULL,
  "relatedEntityId" TEXT NOT NULL,
  "priority" "TechnicianNotificationPriority" NOT NULL DEFAULT 'normal',
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "isDismissed" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "readAt" TIMESTAMP(3),
  "dismissedAt" TIMESTAMP(3),

  CONSTRAINT "TechnicianNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TechnicianDeviceRegistration" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" "MobileDevicePlatform" NOT NULL,
  "token" TEXT NOT NULL,
  "deviceName" TEXT,
  "appBuild" TEXT,
  "nativeAppVersion" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastBadgeCount" INTEGER NOT NULL DEFAULT 0,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TechnicianDeviceRegistration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TechnicianDeviceRegistration_platform_token_key" ON "TechnicianDeviceRegistration"("platform", "token");
CREATE INDEX "TechnicianNotification_tenantId_userId_isRead_isDismissed_createdAt_idx" ON "TechnicianNotification"("tenantId", "userId", "isRead", "isDismissed", "createdAt");
CREATE INDEX "TechnicianNotification_tenantId_relatedEntityType_relatedEntityId_idx" ON "TechnicianNotification"("tenantId", "relatedEntityType", "relatedEntityId");
CREATE INDEX "TechnicianDeviceRegistration_tenantId_userId_isActive_idx" ON "TechnicianDeviceRegistration"("tenantId", "userId", "isActive");

ALTER TABLE "TechnicianNotification"
ADD CONSTRAINT "TechnicianNotification_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TechnicianNotification"
ADD CONSTRAINT "TechnicianNotification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TechnicianDeviceRegistration"
ADD CONSTRAINT "TechnicianDeviceRegistration_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TechnicianDeviceRegistration"
ADD CONSTRAINT "TechnicianDeviceRegistration_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
