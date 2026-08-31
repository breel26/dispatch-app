-- Personnel gains a required, per-org-unique employee number.
--
-- Stored zero-padded to at least six digits ("000001"), matching how PO
-- numbers are stored, so the same worker cannot exist twice as "1" and
-- "000001". modules/inventory/employeeId.ts owns that normalization.
--
-- Hand-written because the column is NOT NULL and the existing rows have
-- nothing to derive a number from. The three workers already on file are
-- numbered 1, 2 and 3 in the order they were created, by primary key
-- rather than by name - names are not unique and can be edited.

ALTER TABLE "Personnel" ADD COLUMN "employeeId" TEXT;

-- dave eguiza (first created)
UPDATE "Personnel" SET "employeeId" = '000001' WHERE "id" = 'cmtf5lr5k0001d8vc2niyria6';
-- Eric Fernando
UPDATE "Personnel" SET "employeeId" = '000002' WHERE "id" = 'cmtgk17jq0003ykvcb7buqhqj';
-- Marco Silva
UPDATE "Personnel" SET "employeeId" = '000003' WHERE "id" = 'cmtgp1a530000swvc5yq4proe';

-- On a fresh database the updates above match nothing and this is a no-op,
-- which is correct. On any OTHER database that already holds personnel,
-- this statement will fail rather than invent numbers for them - that is
-- deliberate: a wrong employee number is worse than a failed migration.
ALTER TABLE "Personnel" ALTER COLUMN "employeeId" SET NOT NULL;

CREATE UNIQUE INDEX "Personnel_orgId_employeeId_key" ON "Personnel"("orgId", "employeeId");
