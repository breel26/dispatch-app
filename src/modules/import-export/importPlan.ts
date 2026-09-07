// Clash detection for imports keyed on a natural number the dispatcher
// supplies - an equipment number or an employee id - rather than one the
// system generates.
//
// The problem this exists to solve: a spreadsheet row whose key already
// exists is ambiguous. It might be a correction to the machine or worker
// already on file (re-importing a fixed export), or it might be a
// different one that was handed a number already in use. Those need
// opposite treatment and look identical to code, so the importer stops
// and asks. This module works out what to ask about.
//
// Deliberately free of both database and format concerns - it takes rows
// that are already parsed and validated plus a snapshot of what keys are
// in use, and returns a plan. That keeps it unit-testable without Postgres
// or an xlsx fixture, and lets Equipment and Personnel share one
// implementation of the reservation logic, which is the fiddly part.

import { z } from "zod";
import type { ValidRow } from "./rows";

/** A key already in use in the database, and who holds it. */
export interface KeyHolder {
  key: string;
  label: string;
}

export interface ClashInfo {
  /**
   * "database" - the key is already on file.
   * "file" - an earlier row in this same upload claimed it. Worth telling
   * apart, because a within-file duplicate is usually a typo in the
   * spreadsheet rather than a genuine collision with the fleet.
   */
  source: "database" | "file";
  /** Who holds the key already: a record's identity, or "row 4". */
  heldBy: string;
  /** Next free key if the dispatcher decides this is a new record, or null when the key space is exhausted. */
  suggestion: string | null;
  /**
   * True when this looks like a genuine collision rather than a re-import
   * of the same record: the incoming description does not match the one
   * already holding the key.
   *
   * Only ever a hint - two different machines can be described the same
   * way, and one machine can be re-described. The review screen uses it to
   * decide what to preselect, never to decide anything on its own.
   *
   * Always true for a within-file duplicate: one spreadsheet listing the
   * same number twice is a mistake regardless of what the rows say.
   */
  likelyDifferent: boolean;
}

export interface PlannedRow<TRow> {
  row: number;
  data: TRow;
  /** The row's key in canonical stored form. */
  key: string;
  /** One-line identity of the incoming row, for the review table. Never sensitive fields. */
  incoming: string;
  /** Null when the key is free and the row can just be created. */
  clash: ClashInfo | null;
}

export interface PlanImportOptions<TRow> {
  rows: ValidRow<TRow>[];
  /** Extracts the row's natural key, already normalized by the row schema. */
  keyOf: (row: TRow) => string;
  /**
   * One-line identity of an incoming row, shown beside the existing record
   * so a dispatcher can tell "same machine, corrected" from "different
   * machine, same number".
   *
   * MUST NOT include sensitive fields. The result crosses into a Client
   * Component, and Personnel rows carry a plaintext SSN and driver license
   * at this point in the pipeline.
   */
  describeRow: (row: TRow) => string;
  /** Keys currently in use in the database. */
  existing: KeyHolder[];
  /**
   * Next free key for this row, avoiding everything in `taken`. Returns
   * null when there is none - equipment numbers run out at 9999 within a
   * type+capacity family.
   */
  suggest: (row: TRow, taken: ReadonlySet<string>) => string | null;
}

/**
 * Works out, for each validated row, whether its key is free and - when it
 * is not - what free key it could take instead.
 *
 * Suggestions are reserved as they are issued, so two new machines that
 * both land in the same type+capacity family are offered different
 * numbers instead of the same one twice. Keys claimed by non-clashing rows
 * are reserved too, so a suggestion never collides with a row later in the
 * same file.
 *
 * A reserved suggestion the dispatcher declines is simply never used. That
 * leaves a gap in the sequence, which is fine: gaps are expected here for
 * the same reason they are expected in PO numbers, and this scheme never
 * reuses a number anyway.
 */
export function planImport<TRow>({
  rows,
  keyOf,
  describeRow,
  existing,
  suggest,
}: PlanImportOptions<TRow>): PlannedRow<TRow>[] {
  const holders = new Map<string, string>();
  for (const holder of existing) holders.set(holder.key, holder.label);

  // Everything a suggestion must steer clear of: keys in the database,
  // keys claimed by rows in this file, and suggestions already handed out.
  const taken = new Set<string>(holders.keys());

  // Keys claimed earlier in this same upload, mapped to the row that
  // claimed them.
  const claimedInFile = new Map<string, number>();

  const planned: PlannedRow<TRow>[] = [];

  for (const { row, data } of rows) {
    const key = keyOf(data);
    const incoming = describeRow(data);

    let clash: ClashInfo | null = null;

    const claimedByRow = claimedInFile.get(key);
    const heldByRecord = holders.get(key);

    if (claimedByRow !== undefined) {
      // Checked before the database, because when both are true the
      // duplicate inside the file is the more surprising fact and the one
      // the dispatcher can actually fix in the spreadsheet.
      clash = {
        source: "file",
        heldBy: `row ${claimedByRow}`,
        suggestion: suggest(data, taken),
        likelyDifferent: true,
      };
    } else if (heldByRecord !== undefined) {
      clash = {
        source: "database",
        heldBy: heldByRecord,
        suggestion: suggest(data, taken),
        // describeRow formats both sides the same way, so this compares
        // like with like.
        likelyDifferent: heldByRecord !== incoming,
      };
    }

    if (clash?.suggestion) taken.add(clash.suggestion);
    if (!clash) taken.add(key);
    claimedInFile.set(key, row);

    planned.push({ row, data, key, incoming, clash });
  }

  return planned;
}

/**
 * What to do with one clashing row.
 *
 * "update" keeps the current behavior - the row overwrites the record that
 * already holds the key. "create" writes a new record at `key` instead,
 * which is the suggested number unless the dispatcher typed a different
 * one.
 */
export type RowDecision = { action: "update" } | { action: "create"; key: string };

/** Decisions from the review screen, keyed by spreadsheet row number. */
export type ImportDecisions = Record<number, RowDecision>;

const rowDecisionSchema = z.union([
  z.object({ action: z.literal("update") }),
  z.object({ action: z.literal("create"), key: z.string().min(1) }),
]);

const decisionsSchema = z.record(z.string().regex(/^\d+$/), rowDecisionSchema);

/**
 * Reads the review screen's answers back out of the hidden form field that
 * carries them.
 *
 * This is untrusted input like any other form value - it arrives as a JSON
 * blob the browser could have rewritten - so it is validated rather than
 * cast. Anything malformed comes back as null, which the caller treats as
 * "no decisions" and turns into another round of review. The worst case is
 * being asked again, never a write nobody chose.
 *
 * Lives here rather than beside the Server Action because a "use server"
 * module may only export async functions, which would make this
 * untestable - and parsing untrusted input is exactly the thing that
 * should have tests.
 */
export function parseDecisions(raw: string | null): ImportDecisions | null {
  if (raw === null || raw.trim() === "") return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const result = decisionsSchema.safeParse(parsed);
  if (!result.success) return null;

  const decisions: ImportDecisions = {};
  for (const [row, decision] of Object.entries(result.data)) {
    decisions[Number(row)] = decision;
  }
  return decisions;
}
