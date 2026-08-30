-- Architecture hardening migration.
--
-- Hand-written rather than generated, because the generated version would
-- have destroyed data: it adds NOT NULL columns to populated tables and
-- drops Quote.price without moving the value anywhere. Every structural
-- change below is paired with the backfill that preserves what is already
-- in the database.
--
-- Covers, in order:
--   1. orgId on every tenant-owned table (backfilled to a legacy org)
--   2. money columns Float -> Decimal(14,4)
--   3. Quote gains line items; the single-price columns move into them
--   4. PO numbering moves from a counter row to a real Postgres sequence
--   5. StockMovement ledger, with opening balances for existing stock
--   6. CHECK constraints for the "exactly one resource FK" invariant
--   7. EXCLUDE constraints that make double-booking impossible
--
-- The org id used to backfill pre-existing rows. It must match
-- DEFAULT_ORG_ID in modules/shared/authContext.ts, which is what
-- single-org deployments run as, or existing data becomes invisible to
-- the app.

-- ---------------------------------------------------------------------
-- 1. Multi-tenancy: orgId everywhere
-- ---------------------------------------------------------------------

ALTER TABLE "Job" ADD COLUMN "orgId" TEXT;
ALTER TABLE "Personnel" ADD COLUMN "orgId" TEXT;
ALTER TABLE "Material" ADD COLUMN "orgId" TEXT;
ALTER TABLE "Equipment" ADD COLUMN "orgId" TEXT;
ALTER TABLE "Vendor" ADD COLUMN "orgId" TEXT;
ALTER TABLE "Assignment" ADD COLUMN "orgId" TEXT;
ALTER TABLE "QuoteRequest" ADD COLUMN "orgId" TEXT;
ALTER TABLE "Quote" ADD COLUMN "orgId" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "orgId" TEXT;

-- Root entities are assigned to the legacy org; everything derived takes
-- its org from its parent, so a row can never end up in a different
-- tenant than the job it belongs to.
UPDATE "Job"           SET "orgId" = 'org_default' WHERE "orgId" IS NULL;
UPDATE "Personnel"     SET "orgId" = 'org_default' WHERE "orgId" IS NULL;
UPDATE "Material"      SET "orgId" = 'org_default' WHERE "orgId" IS NULL;
UPDATE "Equipment"     SET "orgId" = 'org_default' WHERE "orgId" IS NULL;
UPDATE "Vendor"        SET "orgId" = 'org_default' WHERE "orgId" IS NULL;

UPDATE "Assignment" a   SET "orgId" = j."orgId" FROM "Job" j WHERE a."jobId" = j."id" AND a."orgId" IS NULL;
UPDATE "QuoteRequest" qr SET "orgId" = j."orgId" FROM "Job" j WHERE qr."jobId" = j."id" AND qr."orgId" IS NULL;
UPDATE "Quote" q        SET "orgId" = qr."orgId" FROM "QuoteRequest" qr WHERE q."quoteRequestId" = qr."id" AND q."orgId" IS NULL;
UPDATE "PurchaseOrder" po SET "orgId" = j."orgId" FROM "Job" j WHERE po."jobId" = j."id" AND po."orgId" IS NULL;

ALTER TABLE "Job" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Personnel" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Material" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Equipment" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Vendor" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Assignment" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "QuoteRequest" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "Quote" ALTER COLUMN "orgId" SET NOT NULL;
ALTER TABLE "PurchaseOrder" ALTER COLUMN "orgId" SET NOT NULL;

-- Job numbers and material SKUs are unique per org now, not globally.
DROP INDEX "Job_jobNumber_key";
DROP INDEX "Material_sku_key";
DROP INDEX "Job_status_idx";
CREATE UNIQUE INDEX "Job_orgId_jobNumber_key" ON "Job"("orgId", "jobNumber");
CREATE UNIQUE INDEX "Material_orgId_sku_key" ON "Material"("orgId", "sku");
CREATE INDEX "Job_orgId_status_idx" ON "Job"("orgId", "status");
CREATE INDEX "Personnel_orgId_idx" ON "Personnel"("orgId");
CREATE INDEX "Material_orgId_idx" ON "Material"("orgId");
CREATE INDEX "Equipment_orgId_idx" ON "Equipment"("orgId");
CREATE INDEX "Vendor_orgId_idx" ON "Vendor"("orgId");
CREATE INDEX "Assignment_orgId_idx" ON "Assignment"("orgId");
CREATE INDEX "QuoteRequest_orgId_idx" ON "QuoteRequest"("orgId");
CREATE INDEX "Quote_orgId_idx" ON "Quote"("orgId");
CREATE INDEX "PurchaseOrder_orgId_idx" ON "PurchaseOrder"("orgId");

-- ---------------------------------------------------------------------
-- 2 + 3. Money becomes Decimal, and quotes gain line items
-- ---------------------------------------------------------------------

ALTER TABLE "PurchaseOrderLineItem" ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(14,4);

CREATE TABLE "QuoteLineItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "materialId" TEXT,
    "equipmentId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unitPrice" DECIMAL(14,4) NOT NULL,
    "leadTimeDays" INTEGER,

    CONSTRAINT "QuoteLineItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuoteLineItem_quoteId_idx" ON "QuoteLineItem"("quoteId");
CREATE INDEX "QuoteLineItem_materialId_idx" ON "QuoteLineItem"("materialId");
CREATE INDEX "QuoteLineItem_equipmentId_idx" ON "QuoteLineItem"("equipmentId");

ALTER TABLE "QuoteLineItem" ADD CONSTRAINT "QuoteLineItem_quoteId_fkey"
    FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteLineItem" ADD CONSTRAINT "QuoteLineItem_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QuoteLineItem" ADD CONSTRAINT "QuoteLineItem_equipmentId_fkey"
    FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Quote" ADD COLUMN "notes" TEXT;

-- Carry every existing single-price quote across as a one-line quote, so
-- no recorded vendor price is lost. Quantity comes from the matching
-- request line where one exists, falling back to 1.
INSERT INTO "QuoteLineItem" ("id", "quoteId", "materialId", "equipmentId", "quantity", "unitPrice", "leadTimeDays")
SELECT
    gen_random_uuid()::text,
    q."id",
    q."materialId",
    q."equipmentId",
    COALESCE(
        (SELECT qri."quantity"
         FROM "QuoteRequestItem" qri
         WHERE qri."quoteRequestId" = q."quoteRequestId"
           AND (
                (q."materialId" IS NOT NULL AND qri."materialId" = q."materialId")
             OR (q."equipmentId" IS NOT NULL AND qri."equipmentId" = q."equipmentId")
           )
         LIMIT 1),
        1
    ),
    q."price"::DECIMAL(14,4),
    q."leadTimeDays"
FROM "Quote" q
WHERE q."materialId" IS NOT NULL OR q."equipmentId" IS NOT NULL;

ALTER TABLE "Quote" DROP CONSTRAINT "Quote_materialId_fkey";
ALTER TABLE "Quote" DROP CONSTRAINT "Quote_equipmentId_fkey";
ALTER TABLE "Quote" DROP COLUMN "materialId";
ALTER TABLE "Quote" DROP COLUMN "equipmentId";
ALTER TABLE "Quote" DROP COLUMN "price";

-- ---------------------------------------------------------------------
-- 4. PO numbering: counter row -> Postgres sequence
-- ---------------------------------------------------------------------
--
-- The old PurchaseOrderSequence table required a seed row to exist before
-- the first PO could be created, and serialized every PO insert behind a
-- single row lock. A real sequence needs no seeding and no lock. The
-- tradeoff: nextval() is not rolled back by a failed transaction, so a
-- rolled-back PO burns its number. Gaps in PO numbers were already
-- expected and are harmless.
--
-- Starts one past the highest number ever issued so no number is reused.

DO $$
DECLARE
    next_value BIGINT;
BEGIN
    SELECT COALESCE(MAX("lastPoNumber"), 0) + 1 INTO next_value FROM "PurchaseOrderSequence";
    EXECUTE format('CREATE SEQUENCE purchase_order_number_seq AS BIGINT START WITH %s INCREMENT BY 1 MINVALUE 1 NO CYCLE', next_value);
END
$$;

DROP TABLE "PurchaseOrderSequence";

-- ---------------------------------------------------------------------
-- 5. Stock ledger
-- ---------------------------------------------------------------------

CREATE TYPE "StockMovementReason" AS ENUM ('OPENING_BALANCE', 'ASSIGNMENT', 'ASSIGNMENT_CANCELLED', 'ADJUSTMENT', 'RECEIPT');

CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "reason" "StockMovementReason" NOT NULL,
    "note" TEXT,
    "assignmentId" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StockMovement_orgId_materialId_createdAt_idx" ON "StockMovement"("orgId", "materialId", "createdAt");
CREATE INDEX "StockMovement_assignmentId_idx" ON "StockMovement"("assignmentId");

ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "Material"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_assignmentId_fkey"
    FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Every material that already has stock gets an opening-balance entry, so
-- the ledger sums to quantityOnHand from the very first row rather than
-- starting out of balance.
INSERT INTO "StockMovement" ("id", "orgId", "materialId", "delta", "reason", "note")
SELECT gen_random_uuid()::text, m."orgId", m."id", m."quantityOnHand", 'OPENING_BALANCE',
       'Opening balance recorded when the stock ledger was introduced'
FROM "Material" m
WHERE m."quantityOnHand" <> 0;

-- ---------------------------------------------------------------------
-- 6. CHECK constraints: the polymorphic-FK invariant, enforced by the DB
-- ---------------------------------------------------------------------
--
-- These tables each carry a nullable materialId and equipmentId (and for
-- Assignment, personnelId) where exactly one must be set. That rule used
-- to live only in Zod, so any code path that skipped validation could
-- write a row with none or both. Now the database refuses it.

ALTER TABLE "Assignment" ADD CONSTRAINT "assignment_exactly_one_resource" CHECK (
    (("personnelId" IS NOT NULL)::int + ("materialId" IS NOT NULL)::int + ("equipmentId" IS NOT NULL)::int) = 1
    AND (
        ("resourceType" = 'PERSONNEL' AND "personnelId" IS NOT NULL)
     OR ("resourceType" = 'MATERIAL'  AND "materialId"  IS NOT NULL)
     OR ("resourceType" = 'EQUIPMENT' AND "equipmentId" IS NOT NULL)
    )
);

-- Personnel occupy a schedule but consume no stock, so they carry no
-- quantity; materials and equipment must carry a positive one.
ALTER TABLE "Assignment" ADD CONSTRAINT "assignment_quantity_matches_type" CHECK (
    ("resourceType" = 'PERSONNEL' AND "quantity" IS NULL)
 OR ("resourceType" <> 'PERSONNEL' AND "quantity" IS NOT NULL AND "quantity" > 0)
);

ALTER TABLE "Assignment" ADD CONSTRAINT "assignment_window_ordered" CHECK (
    "endAt" IS NULL OR "endAt" >= "startAt"
);

ALTER TABLE "QuoteRequestItem" ADD CONSTRAINT "quote_request_item_exactly_one_resource" CHECK (
    (("materialId" IS NOT NULL)::int + ("equipmentId" IS NOT NULL)::int) = 1
);
ALTER TABLE "QuoteRequestItem" ADD CONSTRAINT "quote_request_item_amounts" CHECK ("quantity" > 0);

ALTER TABLE "QuoteLineItem" ADD CONSTRAINT "quote_line_item_exactly_one_resource" CHECK (
    (("materialId" IS NOT NULL)::int + ("equipmentId" IS NOT NULL)::int) = 1
);
ALTER TABLE "QuoteLineItem" ADD CONSTRAINT "quote_line_item_amounts" CHECK (
    "quantity" > 0 AND "unitPrice" >= 0
);

ALTER TABLE "PurchaseOrderLineItem" ADD CONSTRAINT "po_line_item_exactly_one_resource" CHECK (
    (("materialId" IS NOT NULL)::int + ("equipmentId" IS NOT NULL)::int) = 1
);
ALTER TABLE "PurchaseOrderLineItem" ADD CONSTRAINT "po_line_item_amounts" CHECK (
    "quantity" > 0 AND "unitPrice" >= 0
);

-- Deleting a quote or a PO should take its lines with it.
ALTER TABLE "QuoteRequestItem" DROP CONSTRAINT "QuoteRequestItem_quoteRequestId_fkey";
ALTER TABLE "QuoteRequestItem" ADD CONSTRAINT "QuoteRequestItem_quoteRequestId_fkey"
    FOREIGN KEY ("quoteRequestId") REFERENCES "QuoteRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLineItem" DROP CONSTRAINT "PurchaseOrderLineItem_purchaseOrderId_fkey";
ALTER TABLE "PurchaseOrderLineItem" ADD CONSTRAINT "PurchaseOrderLineItem_purchaseOrderId_fkey"
    FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------
-- 7. EXCLUDE constraints: double-booking becomes impossible
-- ---------------------------------------------------------------------
--
-- Replaces an application-level "fetch every assignment for this resource
-- and look for an overlap in JS, inside a Serializable transaction with a
-- retry loop". Postgres does the same job with a GiST index: correct under
-- any concurrency, no retries, no full-history scan.
--
-- An open-ended assignment (endAt IS NULL) extends to 'infinity', matching
-- how modules/inventory/availability.ts treats it. The '[)' bound means a
-- new assignment may start exactly when the previous one ends.

CREATE EXTENSION IF NOT EXISTS btree_gist;

DROP INDEX "Assignment_personnelId_idx";
DROP INDEX "Assignment_materialId_idx";
DROP INDEX "Assignment_equipmentId_idx";
CREATE INDEX "Assignment_personnelId_startAt_idx" ON "Assignment"("personnelId", "startAt");
CREATE INDEX "Assignment_materialId_startAt_idx" ON "Assignment"("materialId", "startAt");
CREATE INDEX "Assignment_equipmentId_startAt_idx" ON "Assignment"("equipmentId", "startAt");

ALTER TABLE "Assignment" ADD CONSTRAINT "assignment_personnel_no_overlap"
    EXCLUDE USING gist (
        "personnelId" WITH =,
        tsrange("startAt", COALESCE("endAt", 'infinity'::timestamp), '[)') WITH &&
    ) WHERE ("personnelId" IS NOT NULL);

ALTER TABLE "Assignment" ADD CONSTRAINT "assignment_equipment_no_overlap"
    EXCLUDE USING gist (
        "equipmentId" WITH =,
        tsrange("startAt", COALESCE("endAt", 'infinity'::timestamp), '[)') WITH &&
    ) WHERE ("equipmentId" IS NOT NULL);
