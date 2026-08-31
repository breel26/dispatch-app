import { describe, it, expect } from "vitest";
import {
  EMPLOYEE_ID_MIN_DIGITS,
  formatEmployeeId,
  normalizeEmployeeIdInput,
  isCanonicalEmployeeId,
} from "../employeeId";

describe("formatEmployeeId", () => {
  it("pads to at least six digits", () => {
    expect(formatEmployeeId(1)).toBe("000001");
    expect(formatEmployeeId(42)).toBe("000042");
    expect(formatEmployeeId(123456)).toBe("123456");
  });

  // Six is the floor, not the ceiling - a longer badge number keeps its
  // length rather than being truncated to fit.
  it("leaves a number longer than the minimum alone", () => {
    expect(formatEmployeeId(1234567)).toBe("1234567");
  });

  it("refuses values that are not a positive whole number", () => {
    expect(() => formatEmployeeId(0)).toThrow();
    expect(() => formatEmployeeId(-1)).toThrow();
    expect(() => formatEmployeeId(1.5)).toThrow();
  });

  it("agrees with the declared minimum width", () => {
    expect(formatEmployeeId(1)).toHaveLength(EMPLOYEE_ID_MIN_DIGITS);
  });
});

describe("normalizeEmployeeIdInput", () => {
  // The whole point: these are all one worker, so they must all store the
  // same string. A unique index cannot catch this on its own, because the
  // strings genuinely differ.
  it("collapses every way of writing the same number to one stored form", () => {
    expect(normalizeEmployeeIdInput("1")).toBe("000001");
    expect(normalizeEmployeeIdInput("01")).toBe("000001");
    expect(normalizeEmployeeIdInput("000001")).toBe("000001");
    expect(normalizeEmployeeIdInput("0000001")).toBe("000001");
  });

  it("tolerates surrounding whitespace", () => {
    expect(normalizeEmployeeIdInput("  42  ")).toBe("000042");
  });

  it("keeps a badge number longer than six digits at full length", () => {
    expect(normalizeEmployeeIdInput("1234567")).toBe("1234567");
  });

  // Converting to a Number first would round this and quietly normalize it
  // to a DIFFERENT id - the exact bug this module exists to prevent.
  it("does not lose precision on a very long number", () => {
    const long = "90071992547409911";
    expect(normalizeEmployeeIdInput(long)).toBe(long);
  });

  it("rejects anything that is not digits", () => {
    expect(normalizeEmployeeIdInput("E1234")).toBeNull();
    expect(normalizeEmployeeIdInput("12-34")).toBeNull();
    expect(normalizeEmployeeIdInput("abc")).toBeNull();
    expect(normalizeEmployeeIdInput("12.5")).toBeNull();
    expect(normalizeEmployeeIdInput("")).toBeNull();
    expect(normalizeEmployeeIdInput("   ")).toBeNull();
  });

  // Zero is not a person, however many digits were typed.
  it("rejects all-zero input", () => {
    expect(normalizeEmployeeIdInput("0")).toBeNull();
    expect(normalizeEmployeeIdInput("000000")).toBeNull();
  });

  it("is idempotent - normalizing a stored value returns it unchanged", () => {
    const stored = normalizeEmployeeIdInput("7")!;
    expect(normalizeEmployeeIdInput(stored)).toBe(stored);
  });
});

describe("isCanonicalEmployeeId", () => {
  it("accepts the stored form", () => {
    expect(isCanonicalEmployeeId("000001")).toBe(true);
    expect(isCanonicalEmployeeId("1234567")).toBe(true);
  });

  it("rejects anything shorter than the minimum, or all zeros", () => {
    expect(isCanonicalEmployeeId("1")).toBe(false);
    expect(isCanonicalEmployeeId("00001")).toBe(false);
    expect(isCanonicalEmployeeId("000000")).toBe(false);
    expect(isCanonicalEmployeeId("E00001")).toBe(false);
  });

  // Everything normalizeEmployeeIdInput produces must be canonical, or the
  // two functions disagree about what "stored form" means.
  it("accepts everything normalization produces", () => {
    for (const raw of ["1", "42", "000001", "1234567", " 9 "]) {
      const normalized = normalizeEmployeeIdInput(raw);
      expect(normalized).not.toBeNull();
      expect(isCanonicalEmployeeId(normalized!)).toBe(true);
    }
  });
});
