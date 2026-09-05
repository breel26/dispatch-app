-- Equipment gains fleet-management fields: a structured fleet number
-- (type-capacity-sequence, e.g. "03-07-0142"), make, model, operating
-- hours, and required certifications.
--
-- Hand-written for the same reason every migration touching populated
-- tables in this project has been: the generated version would add NOT
-- NULL columns to the three existing rows and fail immediately.
--
-- make/model/equipmentNumber get an honest sentinel, not a guess: the
-- existing rows describe equipment with free text like "32m Pump" and
-- "12k reach forklift" in columns that were never structured make/model
-- fields, and guessing a manufacturer from that text risks recording a
-- wrong one that looks plausible. operatingHours is the one field that
-- stays NULLable rather than backfilled - defaulting it to 0 would
-- misreport equipment already in service as unused, which is worse than
-- leaving it unrecorded.

ALTER TABLE "Equipment" ADD COLUMN "equipmentNumber" TEXT;
ALTER TABLE "Equipment" ADD COLUMN "make" TEXT;
ALTER TABLE "Equipment" ADD COLUMN "model" TEXT;
ALTER TABLE "Equipment" ADD COLUMN "operatingHours" DOUBLE PRECISION;
ALTER TABLE "Equipment" ADD COLUMN "requiredCertifications" TEXT[] NOT NULL DEFAULT '{}';

-- Existing rows get "00-00-0001", "00-00-0002", ... using the type/
-- capacity codes reserved in modules/inventory/equipmentNumber.ts for
-- exactly this: equipment nobody has classified yet. ROW_NUMBER, not a
-- literal per row, so this still works correctly if this database ever
-- has a different set of legacy rows than the three in dev.
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (ORDER BY "createdAt") AS rn
  FROM "Equipment"
  WHERE "equipmentNumber" IS NULL
)
UPDATE "Equipment" e
SET
  "equipmentNumber" = '00-00-' || LPAD(numbered.rn::text, 4, '0'),
  "make" = 'UNKNOWN - UPDATE REQUIRED',
  "model" = 'UNKNOWN - UPDATE REQUIRED'
FROM numbered
WHERE e."id" = numbered."id";

ALTER TABLE "Equipment" ALTER COLUMN "equipmentNumber" SET NOT NULL;
ALTER TABLE "Equipment" ALTER COLUMN "make" SET NOT NULL;
ALTER TABLE "Equipment" ALTER COLUMN "model" SET NOT NULL;

CREATE UNIQUE INDEX "Equipment_orgId_equipmentNumber_key" ON "Equipment"("orgId", "equipmentNumber");
