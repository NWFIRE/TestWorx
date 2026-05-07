ALTER TABLE "Deficiency" ADD COLUMN "quoteId" TEXT;

ALTER TABLE "Deficiency"
  ADD CONSTRAINT "Deficiency_quoteId_fkey"
  FOREIGN KEY ("quoteId") REFERENCES "Quote"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Deficiency_tenantId_quoteId_idx" ON "Deficiency"("tenantId", "quoteId");
