ALTER TABLE "Site" ADD COLUMN "latitude" DOUBLE PRECISION,
                   ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "Site" ADD CONSTRAINT "Site_directions_pin_check" CHECK (
  ("latitude" IS NULL AND "longitude" IS NULL) OR
  ("latitude" IS NOT NULL AND "longitude" IS NOT NULL
   AND "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180)
);
