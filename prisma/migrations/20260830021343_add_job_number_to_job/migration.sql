-- AlterTable
-- Added as nullable first because existing rows have no jobNumber value.
-- Backfilled from `id` (guaranteed unique) as a placeholder, then locked
-- down to NOT NULL + UNIQUE. Dispatchers should replace the placeholder
-- with the real job number via the edit form.
ALTER TABLE "Job" ADD COLUMN "jobNumber" TEXT;

UPDATE "Job" SET "jobNumber" = "id" WHERE "jobNumber" IS NULL;

ALTER TABLE "Job" ALTER COLUMN "jobNumber" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Job_jobNumber_key" ON "Job"("jobNumber");
