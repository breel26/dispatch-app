-- Personnel: replace free-text `role` with Craft and Classification.
--
-- `role` was carrying two facts at once. The live data showed it plainly:
-- one worker was "Carpenter" and another "JM Carpenter" - a trade, and a
-- trade with a classification abbreviation stuck on the front. Neither was
-- queryable, and nothing stopped a third spelling appearing tomorrow.
--
-- Hand-written rather than generated: the generated version would add two
-- NOT NULL columns to populated rows and drop `role` without reading it,
-- which fails on the first count and loses data on the second. Every
-- existing worker's trade is recovered from their `role` text first.

-- ---------------------------------------------------------------------
-- 1. The enums
-- ---------------------------------------------------------------------

CREATE TYPE "Craft" AS ENUM (
    'CARPENTER',
    'LABORER',
    'IRONWORKER',
    'OPERATOR',
    'ELECTRICIAN',
    'PIPE_FITTER',
    'PLUMBER',
    'MASON',
    'PILE_DRIVER',
    'TEAMSTER'
);

CREATE TYPE "Classification" AS ENUM ('JOURNEYMAN', 'APPRENTICE');

-- ---------------------------------------------------------------------
-- 2. Add nullable, so existing rows survive long enough to be backfilled
-- ---------------------------------------------------------------------

ALTER TABLE "Personnel" ADD COLUMN "craft" "Craft";
ALTER TABLE "Personnel" ADD COLUMN "classification" "Classification";

-- ---------------------------------------------------------------------
-- 3. Recover the trade from the old free-text role
-- ---------------------------------------------------------------------
--
-- Matches on substring so decorated values ("JM Carpenter", "Crane
-- Operator", "Pipe Fitter Foreman") still resolve to their trade, and
-- tolerates the common spacing variants. A role naming no recognisable
-- trade falls back to LABORER - a migration must not fail here, and
-- laborer is the safest assumption to correct by hand afterwards.

UPDATE "Personnel" SET "craft" = (
    CASE
        WHEN "role" ILIKE '%carpenter%'                                  THEN 'CARPENTER'
        WHEN "role" ILIKE '%ironworker%' OR "role" ILIKE '%iron worker%' THEN 'IRONWORKER'
        WHEN "role" ILIKE '%electrician%'                                THEN 'ELECTRICIAN'
        WHEN "role" ILIKE '%pipefitter%' OR "role" ILIKE '%pipe fitter%' THEN 'PIPE_FITTER'
        WHEN "role" ILIKE '%plumber%'                                    THEN 'PLUMBER'
        WHEN "role" ILIKE '%mason%'                                      THEN 'MASON'
        WHEN "role" ILIKE '%piledriver%' OR "role" ILIKE '%pile driver%' THEN 'PILE_DRIVER'
        WHEN "role" ILIKE '%teamster%'                                   THEN 'TEAMSTER'
        WHEN "role" ILIKE '%operator%'                                   THEN 'OPERATOR'
        WHEN "role" ILIKE '%labourer%' OR "role" ILIKE '%laborer%'       THEN 'LABORER'
        ELSE 'LABORER'
    END
)::"Craft"
WHERE "craft" IS NULL;

-- ---------------------------------------------------------------------
-- 4. Recover the classification
-- ---------------------------------------------------------------------
--
-- Only an explicit apprentice marker makes someone an apprentice; anything
-- else (including "JM ...", and a bare trade name) is taken as journeyman.
-- The word boundaries matter: without them "APP" would match inside
-- "Apprentice"-unrelated words. This is an inference, not a fact recorded
-- anywhere, so the mapping is reported after the migration runs and can be
-- corrected in the UI.

UPDATE "Personnel" SET "classification" = (
    CASE
        WHEN "role" ~* '(^|[^[:alpha:]])(app|appr|apprentice)([^[:alpha:]]|$)' THEN 'APPRENTICE'
        ELSE 'JOURNEYMAN'
    END
)::"Classification"
WHERE "classification" IS NULL;

-- ---------------------------------------------------------------------
-- 5. Lock them down and retire `role`
-- ---------------------------------------------------------------------

ALTER TABLE "Personnel" ALTER COLUMN "craft" SET NOT NULL;
ALTER TABLE "Personnel" ALTER COLUMN "classification" SET NOT NULL;

CREATE INDEX "Personnel_orgId_craft_idx" ON "Personnel"("orgId", "craft");

ALTER TABLE "Personnel" DROP COLUMN "role";
