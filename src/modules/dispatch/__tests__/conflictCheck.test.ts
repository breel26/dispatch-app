import { describe, it, expect } from "vitest";
import { checkAssignmentConflict, wouldDoubleBook } from "../conflictCheck";

function window(id: string, jobId: string, start: string, end: string | null) {
  return { id, jobId, startAt: new Date(start), endAt: end ? new Date(end) : null };
}

describe("checkAssignmentConflict", () => {
  it("reports no conflict when the resource is free during the candidate window", () => {
    const candidate = { startAt: new Date("2026-06-11"), endAt: new Date("2026-06-15") };
    const existing = [window("a1", "job-1", "2026-06-01", "2026-06-10")];
    const result = checkAssignmentConflict(candidate, existing);
    expect(result.hasConflict).toBe(false);
    expect(result.conflictingWith).toEqual([]);
  });

  it("reports the specific conflicting assignment(s), not just a boolean", () => {
    const candidate = { startAt: new Date("2026-06-05"), endAt: new Date("2026-06-08") };
    const existing = [
      window("a1", "job-1", "2026-01-01", "2026-01-05"), // no conflict
      window("a2", "job-2", "2026-06-01", "2026-06-10"), // conflicts
    ];
    const result = checkAssignmentConflict(candidate, existing);
    expect(result.hasConflict).toBe(true);
    expect(result.conflictingWith.map((w) => w.id)).toEqual(["a2"]);
  });

  it("reports multiple conflicts when the candidate overlaps more than one existing assignment", () => {
    const candidate = { startAt: new Date("2026-06-01"), endAt: new Date("2026-06-30") };
    const existing = [
      window("a1", "job-1", "2026-06-05", "2026-06-10"),
      window("a2", "job-2", "2026-06-15", "2026-06-20"),
    ];
    const result = checkAssignmentConflict(candidate, existing);
    expect(result.conflictingWith.map((w) => w.id).sort()).toEqual(["a1", "a2"]);
  });
});

describe("wouldDoubleBook", () => {
  it("returns true for an overlapping window", () => {
    const candidate = { startAt: new Date("2026-06-05"), endAt: new Date("2026-06-08") };
    const existing = [window("a1", "job-1", "2026-06-01", "2026-06-10")];
    expect(wouldDoubleBook(candidate, existing)).toBe(true);
  });

  it("returns false when there are no existing assignments for this resource", () => {
    const candidate = { startAt: new Date("2026-06-05"), endAt: new Date("2026-06-08") };
    expect(wouldDoubleBook(candidate, [])).toBe(false);
  });
});
