-- Personnel gains the HR/payroll fields from the employee record schema:
-- split name, date of birth, hire date, SSN, driver's license number,
-- home address, and phone. Classification gains FOREMAN and
-- SUPERINTENDENT, real job-site distinctions beyond the trade-grade pair
-- it started with.
--
-- Hand-written for the same reason every migration touching populated
-- Personnel rows in this project has been: the generated version would
-- add NOT NULL columns to rows that already exist and fail immediately.
--
-- SSN and driver's license number are the deliberate exception to "make
-- it NOT NULL and backfill it": they are encrypted in application code
-- (see modules/shared/pii.ts), and the only correct way to backfill an
-- ENCRYPTED value is to run the real encryption function with a real key
-- against a real target environment - not something portable SQL in a
-- migration file can do. Baking one environment's ciphertext into this
-- file would only decrypt correctly under that environment's key, and
-- baking in a fake placeholder's ciphertext would tie every environment
-- to this migration's encryption key forever. Both columns stay nullable
-- at the database level; createPersonnelSchema requires them for newly
-- created personnel, and an existing worker missing one shows as "not on
-- file" until entered through the edit form, which encrypts on save.

-- ---------------------------------------------------------------------
-- 1. Classification gains two more real-world distinctions
-- ---------------------------------------------------------------------

ALTER TYPE "Classification" ADD VALUE 'FOREMAN';
ALTER TYPE "Classification" ADD VALUE 'SUPERINTENDENT';

-- ---------------------------------------------------------------------
-- 2. New columns, added nullable so existing rows survive to be backfilled
-- ---------------------------------------------------------------------

ALTER TABLE "Personnel" ADD COLUMN "firstName" TEXT;
ALTER TABLE "Personnel" ADD COLUMN "middleName" TEXT;
ALTER TABLE "Personnel" ADD COLUMN "lastName" TEXT;
ALTER TABLE "Personnel" ADD COLUMN "dateOfBirth" DATE;
ALTER TABLE "Personnel" ADD COLUMN "hireDate" DATE;
ALTER TABLE "Personnel" ADD COLUMN "ssnEncrypted" BYTEA;
ALTER TABLE "Personnel" ADD COLUMN "driversLicenseNumberEncrypted" BYTEA;
ALTER TABLE "Personnel" ADD COLUMN "homeStreet1" TEXT;
ALTER TABLE "Personnel" ADD COLUMN "homeStreet2" TEXT;
ALTER TABLE "Personnel" ADD COLUMN "homeCity" TEXT;
ALTER TABLE "Personnel" ADD COLUMN "homeState" CHAR(2);
ALTER TABLE "Personnel" ADD COLUMN "homePostalCode" TEXT;
ALTER TABLE "Personnel" ADD COLUMN "homeCountry" TEXT NOT NULL DEFAULT 'US';
ALTER TABLE "Personnel" ADD COLUMN "phoneNumber" TEXT;

-- ---------------------------------------------------------------------
-- 3. Backfill: name split is a real derivation, not a placeholder
-- ---------------------------------------------------------------------
--
-- "dave eguiza" -> firstName "dave", lastName "eguiza". A name with no
-- space (never seen in this data, but not impossible) falls back to the
-- whole thing as firstName with an obvious lastName placeholder, rather
-- than guessing.

UPDATE "Personnel" SET
  "firstName" = CASE
    WHEN position(' ' in "name") > 0 THEN split_part("name", ' ', 1)
    ELSE "name"
  END,
  "lastName" = CASE
    WHEN position(' ' in "name") > 0 THEN trim(substring("name" from position(' ' in "name") + 1))
    ELSE 'UNKNOWN - UPDATE REQUIRED'
  END
WHERE "firstName" IS NULL;

-- ---------------------------------------------------------------------
-- 4. Backfill: fields with no key-dependency, so a plain sentinel is
--    portable across every environment this migration ever runs against
-- ---------------------------------------------------------------------
--
-- dateOfBirth has nothing to derive it from, so it gets an obviously fake
-- sentinel (nobody on a construction crew was born in 1900) rather than a
-- guess that could be mistaken for real data. hireDate uses the date the
-- record was created in this system - not necessarily the real hire date,
-- but a real date, not an invention, and a reasonable starting point.

UPDATE "Personnel" SET
  "dateOfBirth" = DATE '1900-01-01',
  "hireDate" = "createdAt"::date,
  "homeStreet1" = 'UNKNOWN - UPDATE REQUIRED',
  "homeCity" = 'UNKNOWN',
  "homeState" = 'XX',
  "homePostalCode" = '00000',
  "phoneNumber" = '(000) 000-0000'
WHERE "dateOfBirth" IS NULL;

-- ---------------------------------------------------------------------
-- 5. Lock down every field that could be safely backfilled
-- ---------------------------------------------------------------------
--
-- ssnEncrypted and driversLicenseNumberEncrypted are deliberately absent
-- from this list - see the file header.

ALTER TABLE "Personnel" ALTER COLUMN "firstName" SET NOT NULL;
ALTER TABLE "Personnel" ALTER COLUMN "lastName" SET NOT NULL;
ALTER TABLE "Personnel" ALTER COLUMN "dateOfBirth" SET NOT NULL;
ALTER TABLE "Personnel" ALTER COLUMN "hireDate" SET NOT NULL;
ALTER TABLE "Personnel" ALTER COLUMN "homeStreet1" SET NOT NULL;
ALTER TABLE "Personnel" ALTER COLUMN "homeCity" SET NOT NULL;
ALTER TABLE "Personnel" ALTER COLUMN "homeState" SET NOT NULL;
ALTER TABLE "Personnel" ALTER COLUMN "homePostalCode" SET NOT NULL;
ALTER TABLE "Personnel" ALTER COLUMN "phoneNumber" SET NOT NULL;

-- ---------------------------------------------------------------------
-- 6. Retire the free-text `name` field
-- ---------------------------------------------------------------------
--
-- Only four call sites read Personnel.name (checked before writing this
-- migration), the same small blast radius the craft/classification split
-- had - so it is replaced outright rather than kept alongside firstName/
-- lastName, where the two would inevitably drift.

ALTER TABLE "Personnel" DROP COLUMN "name";
