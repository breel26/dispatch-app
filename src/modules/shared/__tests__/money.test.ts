import { describe, it, expect } from "vitest";
import {
  money,
  lineTotal,
  sumMoney,
  sumLineTotals,
  formatMoney,
  parseMoneyInput,
  isMoney,
  ZERO,
} from "../money";

describe("money arithmetic", () => {
  // The reason this module exists. As floats, 0.1 + 0.2 is
  // 0.30000000000000004, and a 40-line purchase order drifts by cents
  // against the invoice it will be paid from.
  it("adds decimal amounts exactly", () => {
    expect(sumMoney(["0.1", "0.2"]).toFixed(2)).toBe("0.30");
    expect(0.1 + 0.2).not.toBe(0.3); // the behaviour being avoided
  });

  it("keeps long chains of additions exact", () => {
    const pennies = Array.from({ length: 100 }, () => "0.01");
    expect(sumMoney(pennies).toFixed(2)).toBe("1.00");
  });

  it("starts from zero for an empty sum", () => {
    expect(sumMoney([]).toFixed(2)).toBe("0.00");
    expect(ZERO.toFixed(2)).toBe("0.00");
  });

  it("multiplies a fractional quantity by a unit price exactly", () => {
    // 3.5 cubic yards at $12.34
    expect(lineTotal(3.5, "12.34").toFixed(2)).toBe("43.19");
  });

  it("rounds a line extension half-up to cents", () => {
    // 3 x 0.125 = 0.375, which must present as 0.38, not 0.37.
    expect(lineTotal(3, "0.125").toFixed(2)).toBe("0.38");
  });

  // Each line is rounded then summed, matching how an invoice is totalled.
  // Summing at full precision and rounding once can disagree by a cent.
  it("totals lines the way an invoice does: round each, then add", () => {
    const total = sumLineTotals([
      { quantity: 3, unitPrice: "0.125" }, // 0.38
      { quantity: 3, unitPrice: "0.125" }, // 0.38
    ]);
    expect(total.toFixed(2)).toBe("0.76");
  });

  it("rejects a non-finite quantity rather than producing NaN money", () => {
    expect(() => lineTotal(Number.NaN, "1.00")).toThrow(/finite/);
    expect(() => lineTotal(Number.POSITIVE_INFINITY, "1.00")).toThrow(/finite/);
  });

  it("accepts strings, numbers, and Decimals interchangeably", () => {
    expect(money("12.34").toFixed(2)).toBe("12.34");
    expect(money(12.34).toFixed(2)).toBe("12.34");
    expect(money(money("12.34")).toFixed(2)).toBe("12.34");
  });

  it("recognises its own Decimal type", () => {
    expect(isMoney(money("1.00"))).toBe(true);
    expect(isMoney("1.00")).toBe(false);
    expect(isMoney(1)).toBe(false);
  });
});

describe("formatMoney", () => {
  it("formats with a currency symbol and two decimals", () => {
    expect(formatMoney("12.5")).toBe("$12.50");
    expect(formatMoney("0")).toBe("$0.00");
  });

  it("groups thousands", () => {
    expect(formatMoney("1234.56")).toBe("$1,234.56");
    expect(formatMoney("1234567.89")).toBe("$1,234,567.89");
  });

  it("puts the minus sign before the currency symbol, as a credit line reads", () => {
    expect(formatMoney("-12")).toBe("-$12.00");
  });

  it("rounds display to cents without changing the stored value", () => {
    expect(formatMoney("12.345")).toBe("$12.35");
  });
});

describe("parseMoneyInput", () => {
  it("accepts a plain decimal", () => {
    expect(parseMoneyInput("12.34")?.toFixed(2)).toBe("12.34");
  });

  // A dispatcher pasting a figure off a vendor quote brings the formatting
  // with it.
  it("tolerates a currency symbol, thousands separators, and whitespace", () => {
    expect(parseMoneyInput("  $1,234.56 ")?.toFixed(2)).toBe("1234.56");
  });

  it("accepts a bare integer and a leading decimal point", () => {
    expect(parseMoneyInput("47")?.toFixed(2)).toBe("47.00");
    expect(parseMoneyInput(".5")?.toFixed(2)).toBe("0.50");
  });

  // Number("") is 0, which would silently record a free item as a real
  // price of zero. Returning null keeps "not entered" distinguishable.
  it("returns null for empty input rather than zero", () => {
    expect(parseMoneyInput("")).toBeNull();
    expect(parseMoneyInput("   ")).toBeNull();
  });

  it("returns null for text that is not a price", () => {
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput("12.34.56")).toBeNull();
    expect(parseMoneyInput("1e5")).toBeNull();
    expect(parseMoneyInput("$")).toBeNull();
  });

  it("preserves precision beyond two decimals for sub-cent unit prices", () => {
    expect(parseMoneyInput("0.0325")?.toFixed(4)).toBe("0.0325");
  });

  // DECIMAL(14,4) holds ten digits before the point. Catching it here means
  // the form can explain itself instead of Postgres raising a numeric
  // overflow at write time.
  it("rejects a value too large for the database column", () => {
    expect(parseMoneyInput("10000000000")).toBeNull();
    expect(parseMoneyInput("9999999999.99")).not.toBeNull();
  });

  it("accepts a negative amount, leaving the sign rule to the schema", () => {
    expect(parseMoneyInput("-5.00")?.toFixed(2)).toBe("-5.00");
  });
});
