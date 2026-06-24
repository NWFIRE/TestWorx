ALTER TYPE "InspectionCloseoutRequestType" ADD VALUE IF NOT EXISTS 'customer_refused';
ALTER TYPE "InspectionCloseoutRequestType" ADD VALUE IF NOT EXISTS 'wrong_due_month';

ALTER TABLE "InspectionCloseoutRequest"
  ADD COLUMN IF NOT EXISTS "requestedDueMonth" TEXT;
