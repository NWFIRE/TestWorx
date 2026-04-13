-- CreateTable
CREATE TABLE "EmailReminderSendLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerCompanyId" TEXT NOT NULL,
    "sentByUserId" TEXT NOT NULL,
    "templateKey" TEXT NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "dueMonth" TEXT,
    "siteSummary" TEXT,
    "subjectSnapshot" TEXT NOT NULL,
    "bodySnapshot" TEXT NOT NULL,
    "inspectionTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "divisions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "messageId" TEXT,
    "provider" TEXT DEFAULT 'resend',
    "providerReason" TEXT,
    "providerError" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailReminderSendLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailReminderSendLog_tenantId_sentAt_idx" ON "EmailReminderSendLog"("tenantId", "sentAt");

-- CreateIndex
CREATE INDEX "EmailReminderSendLog_tenantId_dueMonth_idx" ON "EmailReminderSendLog"("tenantId", "dueMonth");

-- CreateIndex
CREATE INDEX "EmailReminderSendLog_tenantId_customerCompanyId_sentAt_idx" ON "EmailReminderSendLog"("tenantId", "customerCompanyId", "sentAt");

-- AddForeignKey
ALTER TABLE "EmailReminderSendLog" ADD CONSTRAINT "EmailReminderSendLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailReminderSendLog" ADD CONSTRAINT "EmailReminderSendLog_customerCompanyId_fkey" FOREIGN KEY ("customerCompanyId") REFERENCES "CustomerCompany"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailReminderSendLog" ADD CONSTRAINT "EmailReminderSendLog_sentByUserId_fkey" FOREIGN KEY ("sentByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
