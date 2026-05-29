-- Backfill active default Work Order labor types for all existing tenants.
WITH defaults("code", "name", "sortOrder") AS (
  VALUES
    ('fire_alarm', 'Fire Alarm', 10),
    ('kitchen_suppression', 'Kitchen Suppression', 20),
    ('fire_sprinkler', 'Fire Sprinkler', 30),
    ('fire_extinguishers', 'Fire Extinguisher', 40),
    ('emergency_light', 'Emergency Light', 50),
    ('industrial_dry_chemical', 'Industrial Dry Chemical', 60),
    ('backflow', 'Backflow', 70),
    ('general_service', 'General Service', 80),
    ('other', 'Other', 90)
)
INSERT INTO "WorkOrderLaborType" (
  "id",
  "tenantId",
  "code",
  "name",
  "sortOrder",
  "active",
  "taxable",
  "rate",
  "createdAt",
  "updatedAt"
)
SELECT
  'wolt_' || md5("Tenant"."id" || defaults."code" || clock_timestamp()::text || random()::text),
  "Tenant"."id",
  defaults."code",
  defaults."name",
  defaults."sortOrder",
  true,
  false,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Tenant"
CROSS JOIN defaults
ON CONFLICT ("tenantId", "code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "sortOrder" = EXCLUDED."sortOrder",
  "active" = true,
  "updatedAt" = CURRENT_TIMESTAMP;
