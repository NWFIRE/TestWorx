CREATE TYPE "QuickBooksConnectionMode" AS ENUM ('sandbox', 'live');

ALTER TABLE "Tenant"
ADD COLUMN "quickbooksConnectionMode" "QuickBooksConnectionMode";

ALTER TABLE "InspectionBillingSummary"
ADD COLUMN "quickbooksConnectionMode" "QuickBooksConnectionMode";
