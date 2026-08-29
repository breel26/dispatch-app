import { describe, it, expect } from "vitest";
import { windowsOverlap, hasSchedulingConflict, findConflictingWindows } from "../availability";

function window(start: string, end: string | null) {
  return { startAt: new Date(start), endAt: end ? new Date(end) : null };
}

describe("windowsOverlap", () => {
  it("detects overlap when ranges intersect", () => {
    const a = window("2026-06-01", "2026-06-10");
    const b = window("2026-06-05", "2026-06-15");
    expect(windowsOverlap(a, b)).toBe(true);
  });

  it("detects overlap when one window fully contains the other", () => {
    const a = window("2026-06-01", "2026-06-30");
    const b = window("2026-06-10", "2026-06-15");
    expect(windowsOverlap(a, b)).toBe(true);
  });

  it("returns false for back-to-back non-overlapping windows", () => {
    const a = window("2026-06-01", "2026-06-10");
    const b = window("2026-06-10", "2026-06-20");
    // a ends exactly when b starts — treated as NOT overlapping (a
    // resource freed at 6/10 can be picked up starting 6/10)
    expect(windowsOverlap(a, b)).toBe(false);
  });

  it("returns false for clearly separate windows", () => {
    const a = window("2026-06-01", "2026-06-05");
    const b = window("2026-07-01", "2026-07-05");
    expect(windowsOverlap(a, b)).toBe(false);
  });

  it("treats an open-ended window (no endAt) as conflicting with anything starting after it", () => {
    const ongoing = window("2026-06-01", null);
    const later = window("2026-08-01", "2026-08-05");
    expect(windowsOverlap(ongoing, later)).toBe(true);
  });

  it("two open-ended windows that both started always overlap", () => {
    const a = window("2026-06-01", null);
    const b = window("2026-07-01", null);
    expect(windowsOverlap(a, b)).toBe(true);
  });

  it("is symmetric — order of arguments does not change the result", () => {
    const a = window("2026-06-01", "2026-06-10");
    const b = window("2026-06-05", "2026-06-15");
    expect(windowsOverlap(a, b)).toBe(windowsOverlap(b, a));
  });
});

describe("hasSchedulingConflict", () => {
  it("returns true when the candidate overlaps an existing window", () => {
    const candidate = window("2026-06-05", "2026-06-08");
    const existing = [window("2026-06-01", "2026-06-10")];
    expect(hasSchedulingConflict(candidate, existing)).toBe(true);
  });

  it("returns false when the candidate fits in a gap between windows", () => {
    const candidate = window("2026-06-11", "2026-06-15");
    const existing = [window("2026-06-01", "2026-06-10"), window("2026-06-20", "2026-06-25")];
    expect(hasSchedulingConflict(candidate, existing)).toBe(false);
  });

  it("returns false for an empty existing list", () => {
    const candidate = window("2026-06-05", "2026-06-08");
    expect(hasSchedulingConflict(candidate, [])).toBe(false);
  });
});

describe("findConflictingWindows", () => {
  it("returns only the windows that actually conflict, not all existing windows", () => {
    const candidate = window("2026-06-05", "2026-06-08");
    const existing = [
      { id: "keep-a", ...window("2026-01-01", "2026-01-05") },
      { id: "conflict-b", ...window("2026-06-01", "2026-06-10") },
      { id: "keep-c", ...window("2026-12-01", "2026-12-05") },
    ];
    const result = findConflictingWindows(candidate, existing);
    expect(result.map((w) => w.id)).toEqual(["conflict-b"]);
  });
});
