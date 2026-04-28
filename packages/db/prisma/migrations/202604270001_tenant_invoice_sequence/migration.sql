CREATE TABLE "TenantInvoiceSequence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "nextNumber" INTEGER NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantInvoiceSequence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantInvoiceSequence_tenantId_year_key" ON "TenantInvoiceSequence"("tenantId", "year");

CREATE INDEX "TenantInvoiceSequence_tenantId_idx" ON "TenantInvoiceSequence"("tenantId");

ALTER TABLE "TenantInvoiceSequence" ADD CONSTRAINT "TenantInvoiceSequence_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

WITH invoice_matches AS (
    SELECT
        "tenantId",
        (substring("quickbooksInvoiceNumber" FROM '^TW([0-9]{4})-[0-9]{4,}$'))::INTEGER AS "year",
        (substring("quickbooksInvoiceNumber" FROM '^TW[0-9]{4}-([0-9]{4,})$'))::INTEGER AS "invoiceNumber"
    FROM "InspectionBillingSummary"
    WHERE "quickbooksInvoiceNumber" ~ '^TW[0-9]{4}-[0-9]{4,}$'
),
existing_sequences AS (
    SELECT
        "tenantId",
        "year",
        GREATEST(MAX("invoiceNumber") + 1, 1000) AS "nextNumber"
    FROM invoice_matches
    GROUP BY "tenantId", "year"
)
INSERT INTO "TenantInvoiceSequence" ("id", "tenantId", "year", "nextNumber", "createdAt", "updatedAt")
SELECT
    'invoice_seq_' || md5("tenantId" || '-' || "year"::TEXT),
    "tenantId",
    "year",
    "nextNumber",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM existing_sequences;
