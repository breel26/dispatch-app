import { Prisma } from "@prisma/client";

// Money is Prisma.Decimal (arbitrary-precision), never `number`.
//
// The prices in this app end up on a purchase order that gets emailed to
// a vendor and paid against. Binary floating point cannot represent most
// decimal fractions, so `0.1 + 0.2 === 0.30000000000000004` and a 40-line
// PO drifts by cents. Those cents are a real discrepancy against a real
// invoice, so every price column is DECIMAL(14,4) in Postgres and every
// calculation goes through this module.
//
// Prisma.Decimal is decimal.js. It is re-exported here rather than
// importing decimal.js directly, because values read back from Prisma are
// instances of *Prisma's* Decimal class - a separately-constructed
// decimal.js - and `instanceof` across the two does not hold.

export type Money = Prisma.Decimal;
export const Money = Prisma.Decimal;

export const ZERO: Money = new Prisma.Decimal(0);

// Cents, i.e. what gets displayed and paid. Line extensions are rounded
// here rather than at the end, matching how an invoice is actually
// totalled: each line is rounded to cents, then the lines are added. The
// alternative (sum at full precision, round once) can disagree with a
// vendor's own arithmetic by a cent on long orders.
const DISPLAY_DP = 2;

export function money(value: Money | string | number): Money {
  return new Prisma.Decimal(value);
}

export function isMoney(value: unknown): value is Money {
  return Prisma.Decimal.isDecimal(value);
}

// Extends one line: quantity x unit price, rounded to cents half-up.
// Quantity stays a plain number - it is a measurement (3.5 cubic yards),
// not an amount of money, and float precision is fine for it.
export function lineTotal(quantity: number, unitPrice: Money | string | number): Money {
  if (!Number.isFinite(quantity)) {
    throw new Error(`lineTotal: quantity must be a finite number, got ${quantity}`);
  }
  return money(unitPrice).times(quantity).toDecimalPlaces(DISPLAY_DP, Prisma.Decimal.ROUND_HALF_UP);
}

export function sumMoney(values: (Money | string | number)[]): Money {
  return values.reduce<Money>((total, value) => total.plus(money(value)), ZERO);
}

// Sums already-extended line totals. Kept as its own function so callers
// read as "total of these lines" rather than assembling the reduce by
// hand at each call site, and so the rounding policy has one home.
export function sumLineTotals(
  lines: { quantity: number; unitPrice: Money | string | number }[]
): Money {
  return sumMoney(lines.map((line) => lineTotal(line.quantity, line.unitPrice)));
}

// Formats for display: "$1,234.56". Negative amounts render as "-$12.00"
// rather than "$-12.00", which is what a dispatcher expects to see on a
// credit line.
export function formatMoney(value: Money | string | number): string {
  const amount = money(value);
  const fixed = amount.abs().toFixed(DISPLAY_DP);
  const [whole, fraction] = fixed.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${amount.isNegative() ? "-" : ""}$${grouped}.${fraction}`;
}

// Parses a price typed into a form. Tolerates a leading currency symbol,
// thousands separators, and surrounding whitespace, because those are all
// things a dispatcher copying a number off a vendor quote will paste in.
// Returns null for anything that is not a number, so callers can tell
// "that is not a price" apart from "the price is zero" - a distinction
// Number("") === 0 silently destroys.
export function parseMoneyInput(raw: string): Money | null {
  const cleaned = raw.trim().replace(/^\$/, "").replace(/,/g, "");
  if (cleaned === "" || !/^-?\d*\.?\d+$/.test(cleaned)) return null;

  try {
    const value = new Prisma.Decimal(cleaned);
    // DECIMAL(14,4) holds 10 digits before the point. A larger number
    // would be rejected by Postgres at write time with an opaque error;
    // catching it here lets the form say something useful.
    if (value.abs().greaterThanOrEqualTo(new Prisma.Decimal("1e10"))) return null;
    return value;
  } catch {
    return null;
  }
}
