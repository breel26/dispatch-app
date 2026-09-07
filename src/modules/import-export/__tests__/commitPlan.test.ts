import { describe, it, expect } from "vitest";
import { commitPlan } from "../commitPlan";
import type { PlannedRow } from "../importPlan";
import type { ImportDecisions } from "../importPlan";

const ORG = "org_1";

interface Row {
  key: string;
  label: string;
}

/** Records what was written, so a test can assert on the writes themselves. */
function fakeWriter(existingKeys: string[] = []) {
  const existing = new Map(existingKeys.map((key, i) => [key, { id: `id_${i}` }]));
  const created: Row[] = [];
  const updated: { id: string; row: Row }[] = [];

  return {
    created,
    updated,
    options: {
      orgId: ORG,
      withKey: (row: Row, key: string) => ({ ...row, key }),
      findExisting: async (_orgId: string, key: string) => existing.get(key) ?? null,
      create: async (_orgId: string, row: Row) => {
        created.push(row);
      },
      update: async (_orgId: string, id: string, row: Row) => {
        updated.push({ id, row });
      },
      describeError: (err: unknown) => (err as Error).message,
    },
  };
}

function planned(row: number, key: string, label: string, clashing: boolean): PlannedRow<Row> {
  return {
    row,
    key,
    data: { key, label },
    incoming: label,
    clash: clashing
      ? { source: "database", heldBy: "someone", suggestion: null, likelyDifferent: true }
      : null,
  };
}

async function run(plan: PlannedRow<Row>[], decisions: ImportDecisions, existing: string[] = []) {
  const writer = fakeWriter(existing);
  const result = await commitPlan({ ...writer.options, plan, decisions });
  return { result, created: writer.created, updated: writer.updated };
}

describe("commitPlan", () => {
  it("creates rows that never clashed, without needing a decision", async () => {
    const { result, created } = await run([planned(1, "A-1", "New machine", false)], {});

    expect(result).toMatchObject({ createdCount: 1, updatedCount: 0, errors: [] });
    expect(created).toEqual([{ key: "A-1", label: "New machine" }]);
  });

  it("overwrites the existing record when the decision is update", async () => {
    const { result, updated, created } = await run(
      [planned(1, "A-1", "Corrected", true)],
      { 1: { action: "update" } },
      ["A-1"]
    );

    expect(result).toMatchObject({ createdCount: 0, updatedCount: 1, errors: [] });
    expect(updated).toEqual([{ id: "id_0", row: { key: "A-1", label: "Corrected" } }]);
    expect(created).toEqual([]);
  });

  it("creates at the chosen number when the decision is create", async () => {
    const { result, created, updated } = await run(
      [planned(1, "A-1", "Different machine", true)],
      { 1: { action: "create", key: "A-9" } },
      ["A-1"]
    );

    expect(result).toMatchObject({ createdCount: 1, updatedCount: 0, errors: [] });
    // The row must be written at the NEW key, not the one it arrived with -
    // otherwise the renumber is cosmetic and the write still collides.
    expect(created).toEqual([{ key: "A-9", label: "Different machine" }]);
    expect(updated).toEqual([]);
  });

  it("skips a clashing row with no decision instead of guessing", async () => {
    // The whole point of the feature: an unanswered clash must not fall
    // back to either overwriting or duplicating.
    const { result, created, updated } = await run([planned(1, "A-1", "Ambiguous", true)], {}, [
      "A-1",
    ]);

    expect(result.createdCount).toBe(0);
    expect(result.updatedCount).toBe(0);
    expect(result.errors).toEqual([
      { row: 1, message: "A-1 is already in use and no choice was made for this row" },
    ]);
    expect(created).toEqual([]);
    expect(updated).toEqual([]);
  });

  it("reports an update whose target vanished between review and commit", async () => {
    const { result, created } = await run(
      [planned(1, "A-1", "Corrected", true)],
      { 1: { action: "update" } },
      [] // nothing on file any more
    );

    expect(result.errors).toEqual([
      { row: 1, message: "A-1 no longer exists, so there was nothing to update" },
    ]);
    // Must not quietly create it instead.
    expect(created).toEqual([]);
  });

  it("keeps going after a row throws, and reports it against its own row number", async () => {
    const writer = fakeWriter();
    const failing = {
      ...writer.options,
      create: async (_orgId: string, row: Row) => {
        if (row.key === "A-2") throw new Error("duplicate key");
        writer.created.push(row);
      },
    };

    const result = await commitPlan({
      ...failing,
      plan: [
        planned(1, "A-1", "First", false),
        planned(2, "A-2", "Explodes", false),
        planned(3, "A-3", "Third", false),
      ],
      decisions: {},
    });

    expect(result.createdCount).toBe(2);
    expect(result.errors).toEqual([{ row: 2, message: "duplicate key" }]);
    expect(writer.created.map((r) => r.key)).toEqual(["A-1", "A-3"]);
  });

  it("applies each decision to its own row when several are mixed together", async () => {
    const { result, created, updated } = await run(
      [
        planned(1, "A-1", "Re-import", true),
        planned(2, "A-2", "Different", true),
        planned(3, "A-3", "Brand new", false),
        planned(4, "A-4", "Unanswered", true),
      ],
      {
        1: { action: "update" },
        2: { action: "create", key: "A-9" },
      },
      ["A-1", "A-2", "A-4"]
    );

    expect(result.createdCount).toBe(2);
    expect(result.updatedCount).toBe(1);
    expect(updated.map((u) => u.row.label)).toEqual(["Re-import"]);
    expect(created.map((c) => c.key)).toEqual(["A-9", "A-3"]);
    expect(result.errors).toEqual([
      { row: 4, message: "A-4 is already in use and no choice was made for this row" },
    ]);
  });

  it("ignores a decision aimed at a row that is not clashing", async () => {
    // A hand-edited payload could name any row. A clean row is created
    // regardless, never diverted into an update.
    const { result, created, updated } = await run([planned(1, "A-1", "Clean", false)], {
      1: { action: "update" },
    });

    expect(created).toEqual([{ key: "A-1", label: "Clean" }]);
    expect(updated).toEqual([]);
    expect(result.errors).toEqual([]);
  });
});
