-- Assignments are cancelled, not deleted.
--
-- Deleting the row severed StockMovement.assignmentId (ON DELETE SET
-- NULL), so cancelling a material assignment destroyed the link between
-- the stock that came back and the assignment it came back from. A ledger
-- that forgets its own provenance on cancellation cannot answer the
-- question it was introduced to answer.
--
-- The overlap constraints are rebuilt to ignore cancelled rows, so a
-- cancelled assignment still frees the person or machine for rebooking.

ALTER TABLE "Assignment" ADD COLUMN "cancelledAt" TIMESTAMP(3);

CREATE INDEX "Assignment_jobId_cancelledAt_idx" ON "Assignment"("jobId", "cancelledAt");

ALTER TABLE "Assignment" DROP CONSTRAINT "assignment_personnel_no_overlap";
ALTER TABLE "Assignment" DROP CONSTRAINT "assignment_equipment_no_overlap";

ALTER TABLE "Assignment" ADD CONSTRAINT "assignment_personnel_no_overlap"
    EXCLUDE USING gist (
        "personnelId" WITH =,
        tsrange("startAt", COALESCE("endAt", 'infinity'::timestamp), '[)') WITH &&
    ) WHERE ("personnelId" IS NOT NULL AND "cancelledAt" IS NULL);

ALTER TABLE "Assignment" ADD CONSTRAINT "assignment_equipment_no_overlap"
    EXCLUDE USING gist (
        "equipmentId" WITH =,
        tsrange("startAt", COALESCE("endAt", 'infinity'::timestamp), '[)') WITH &&
    ) WHERE ("equipmentId" IS NOT NULL AND "cancelledAt" IS NULL);
