import { describe, it, expect } from "vitest";
import { formatPoNumber, parsePoNumber, normalizePoNumberInput } from "../poNumber";

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

describe("normalizePoNumberInput", () => {
  it("passes a canonical PO number through unchanged", () => {
    expect(normalizePoNumberInput("PO-000047")).toBe("PO-000047");
  });

  it("pads a bare sequence number", () => {
    expect(normalizePoNumberInput("47")).toBe("PO-000047");
  });

  it("accepts a lowercase prefix", () => {
    expect(normalizePoNumberInput("po-000047")).toBe("PO-000047");
  });

  it("accepts a space or underscore instead of the hyphen", () => {
    expect(normalizePoNumberInput("PO 47")).toBe("PO-000047");
    expect(normalizePoNumberInput("PO_47")).toBe("PO-000047");
  });

  it("accepts the prefix with no separator at all", () => {
    expect(normalizePoNumberInput("PO47")).toBe("PO-000047");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizePoNumberInput("  PO-000047  ")).toBe("PO-000047");
  });

  it("normalizes any input that refers to the same PO to one string", () => {
    const variants = ["PO-000047", "po-000047", "PO 47", "po47", "47", " 000047 "];
    const normalized = new Set(variants.map(normalizePoNumberInput));
    expect(normalized).toEqual(new Set(["PO-000047"]));
  });

  it("keeps numbers wider than the pad width intact", () => {
    expect(normalizePoNumberInput("1234567")).toBe("PO-1234567");
  });

  it("round-trips with formatPoNumber", () => {
    for (const n of [1, 42, 999, 100000]) {
      expect(normalizePoNumberInput(formatPoNumber(n))).toBe(formatPoNumber(n));
    }
  });

  it("returns null for an empty or whitespace-only string", () => {
    expect(normalizePoNumberInput("")).toBeNull();
    expect(normalizePoNumberInput("   ")).toBeNull();
  });

  it("returns null for the prefix with no digits", () => {
    expect(normalizePoNumberInput("PO-")).toBeNull();
    expect(normalizePoNumberInput("PO")).toBeNull();
  });

  it("returns null for non-numeric input", () => {
    expect(normalizePoNumberInput("PO-ABC")).toBeNull();
    expect(normalizePoNumberInput("excavator")).toBeNull();
  });

  it("returns null for a prefix it doesn't recognize", () => {
    expect(normalizePoNumberInput("INV-000047")).toBeNull();
  });

  it("returns null for zero and negative numbers, which the sequence never issues", () => {
    expect(normalizePoNumberInput("0")).toBeNull();
    expect(normalizePoNumberInput("PO-000000")).toBeNull();
    expect(normalizePoNumberInput("-5")).toBeNull();
  });

  it("returns null rather than silently losing precision on a huge number", () => {
    // Number("99999999999999999999") rounds — normalizing it would look
    // up a different PO than the one typed.
    expect(normalizePoNumberInput("99999999999999999999")).toBeNull();
  });

  it("returns null for a decimal", () => {
    expect(normalizePoNumberInput("47.5")).toBeNull();
  });
});
