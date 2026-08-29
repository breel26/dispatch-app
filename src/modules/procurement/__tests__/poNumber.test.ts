import { describe, it, expect } from "vitest";
import { formatPoNumber, parsePoNumber } from "../poNumber";

describe("formatPoNumber", () => {
  it("formats a small number with zero-padding", () => {
    expect(formatPoNumber(1)).toBe("PO-000001");
  });

  it("formats a larger number correctly", () => {
    expect(formatPoNumber(123)).toBe("PO-000123");
  });

  it("formats a number at the padding width boundary without truncation", () => {
    expect(formatPoNumber(999999)).toBe("PO-999999");
  });

  it("does not truncate a number wider than the pad width", () => {
    expect(formatPoNumber(1234567)).toBe("PO-1234567");
  });

  it("throws on zero", () => {
    expect(() => formatPoNumber(0)).toThrow("Invalid PO sequence value");
  });

  it("throws on a negative number", () => {
    expect(() => formatPoNumber(-5)).toThrow("Invalid PO sequence value");
  });

  it("throws on a non-integer", () => {
    expect(() => formatPoNumber(1.5)).toThrow("Invalid PO sequence value");
  });
});

describe("parsePoNumber", () => {
  it("parses a correctly formatted PO number back to its integer", () => {
    expect(parsePoNumber("PO-000123")).toBe(123);
  });

  it("round-trips with formatPoNumber", () => {
    for (const n of [1, 42, 999, 100000]) {
      expect(parsePoNumber(formatPoNumber(n))).toBe(n);
    }
  });

  it("returns null for a string missing the prefix", () => {
    expect(parsePoNumber("000123")).toBeNull();
  });

  it("returns null for a malformed string", () => {
    expect(parsePoNumber("PO-ABC123")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parsePoNumber("")).toBeNull();
  });
});
