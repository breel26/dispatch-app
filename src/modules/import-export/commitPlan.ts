// Applies a decided import plan, one row at a time.
//
// Split out of the Server Action for two reasons. A "use server" module may
// only export async functions, so anything living there is untestable; and
// this is the code that decides what actually gets written, which is the
// last place that should go untested. The writes arrive as callbacks, so it
// runs against fakes with no database in sight.

import type { ImportDecisions } from "./importPlan";
import type { PlannedRow } from "./importPlan";

export interface CommitResult {
  createdCount: number;
  updatedCount: number;
  errors: { row: number; message: string }[];
}

export interface CommitPlanOptions<TRow> {
  orgId: string;
  plan: PlannedRow<TRow>[];
  decisions: ImportDecisions;
  /** Returns the row with its natural key replaced, for a renumbered create. */
  withKey: (row: TRow, key: string) => TRow;
  findExisting: (orgId: string, key: string) => Promise<{ id: string } | null>;
  create: (orgId: string, row: TRow) => Promise<unknown>;
  update: (orgId: string, id: string, row: TRow) => Promise<unknown>;
  /** Turns a thrown error into something worth showing a dispatcher. */
  describeError: (err: unknown) => string;
}

/**
 * Walks a plan and writes it, one row at a time.
 *
 * Rows with no clash are created. Rows with a clash need a decision:
 * overwrite the record already holding the number, or create a new record
 * at a different one. A clashing row with no decision is reported as an
 * error and skipped, never guessed at - guessing wrong here either
 * overwrites a machine that exists or duplicates one that does not.
 */
export async function commitPlan<TRow>({
  orgId,
  plan,
  decisions,
  withKey,
  findExisting,
  create,
  update,
  describeError,
}: CommitPlanOptions<TRow>): Promise<CommitResult> {
  let createdCount = 0;
  let updatedCount = 0;
  const errors: { row: number; message: string }[] = [];

  for (const planned of plan) {
    try {
      if (!planned.clash) {
        await create(orgId, planned.data);
        createdCount++;
        continue;
      }

      const decision = decisions[planned.row];
      if (!decision) {
        // Reachable two ways: the form sent nothing for this row, or the
        // row only started clashing between the review and the commit
        // because the number was taken in the meantime.
        errors.push({
          row: planned.row,
          message: `${planned.key} is already in use and no choice was made for this row`,
        });
        continue;
      }

      if (decision.action === "update") {
        const existing = await findExisting(orgId, planned.key);
        if (!existing) {
          // Deleted between the review and the commit. Creating it instead
          // would be a reasonable guess and still the wrong thing to do
          // without asking.
          errors.push({
            row: planned.row,
            message: `${planned.key} no longer exists, so there was nothing to update`,
          });
          continue;
        }
        await update(orgId, existing.id, planned.data);
        updatedCount++;
        continue;
      }

      await create(orgId, withKey(planned.data, decision.key));
      createdCount++;
    } catch (err) {
      errors.push({ row: planned.row, message: describeError(err) });
    }
  }

  return { createdCount, updatedCount, errors };
}
