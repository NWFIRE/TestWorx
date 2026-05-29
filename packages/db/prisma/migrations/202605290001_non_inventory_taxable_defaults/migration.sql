-- Non-inventory billing items are taxable by default. Keep inventory-specific tax
-- behavior intact by only updating non-inventory catalog/service/labor records.
UPDATE "QuickBooksCatalogItem"
SET "taxable" = TRUE
WHERE LOWER("itemType") <> 'inventory';

UPDATE "WorkOrderLaborType"
SET "taxable" = TRUE;

ALTER TABLE "QuickBooksCatalogItem"
ALTER COLUMN "taxable" SET DEFAULT TRUE;

ALTER TABLE "WorkOrderLaborType"
ALTER COLUMN "taxable" SET DEFAULT TRUE;
