// Employee numbers: the id a worker is known by on payroll and paperwork.
//
// Same problem PO numbers have, and the same treatment (see
// modules/procurement/poNumber.ts). A number that people read off a badge,
// a timesheet, or over the phone arrives in whatever form the person
// happened to type: "1", "000001", " 42 ". Stored naively those become
// different workers, and a unique index cannot save you because the
// strings genuinely differ.
//
// So there is one canonical stored form - digits, zero-padded to at least
// six - and everything that writes an employee number goes through
// normalizeEmployeeIdInput first. The Zod schema applies it, so no code
// path can store an un-normalized value.

// "At least six digits": six is the floor, not the ceiling. A longer badge
// number keeps its length rather than being truncated to fit.
export const EMPLOYEE_ID_MIN_DIGITS = 6;

// Formats a plain number into the stored form. Kept separate from
// normalization so the padding rule - easy to get subtly wrong - is
// testable on its own.
export function formatEmployeeId(value: number): string {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid employee number: ${value}`);
  }
  return String(value).padStart(EMPLOYEE_ID_MIN_DIGITS, "0");
}

// Turns what somebody typed into the canonical stored form, or null if it
// is not an employee number at all. Returning null rather than throwing
// lets callers tell "that is not a valid number" apart from "no worker has
// that number" - two different things to say to a dispatcher.
//
// Deliberately works on the digit string rather than converting to a
// Number: a long badge number would lose precision through Number() and
// silently normalize to a DIFFERENT worker's id, which is exactly the
// class of bug this module exists to prevent.
export function normalizeEmployeeIdInput(raw: string): string | null {
  const trimmed = raw.trim();

  if (!/^\d+$/.test(trimmed)) return null;

  // All zeros is not a real employee, however many digits were typed.
  if (/^0+$/.test(trimmed)) return null;

  // Leading zeros are padding, not part of the number - "000001", "0001"
  // and "1" are one worker, so they all collapse to the same stored form.
  const significant = trimmed.replace(/^0+/, "");

  return significant.padStart(EMPLOYEE_ID_MIN_DIGITS, "0");
}

// True when a value is already in the exact stored form. Used by tests and
// by anything checking data at rest; input from a person should go through
// normalizeEmployeeIdInput instead, which is deliberately forgiving.
export function isCanonicalEmployeeId(value: string): boolean {
  return new RegExp(`^\\d{${EMPLOYEE_ID_MIN_DIGITS},}$`).test(value) && !/^0+$/.test(value);
}

// Suggests the next employee number: the highest in use, plus one.
//
// Same no-gap-filling rule as nextEquipmentNumber, for the same reason -
// an employee number is on timesheets, certified payroll and I-9s long
// after the worker leaves, so it is never handed to a second person.
//
// Note the BigInt. This module exists because Number() silently mangles a
// long badge number, and finding a maximum is exactly where that bug would
// come back: Number("100000000000000001") and Number("100000000000000002")
// are the same float, so the wrong id would win and the "next" id would
// collide with one already issued. Comparison and increment both stay in
// integer arithmetic that has no precision ceiling.
//
// Unlike equipment numbers there is no exhaustion case to report: employee
// ids have a minimum width, not a maximum, so the next one always exists.
//
// BigInt(0) rather than the 0n literal only because the project targets
// ES2017, where that syntax is not available; the lib is esnext, so the
// type and the runtime behavior are the same either way.
export function nextEmployeeId(existingIds: Iterable<string>): string {
  let highest = BigInt(0);

  for (const value of existingIds) {
    const trimmed = value.trim();
    // Anything that is not a plain digit string is not an employee number
    // and tells us nothing about what is taken.
    if (!/^\d+$/.test(trimmed)) continue;

    const numeric = BigInt(trimmed);
    if (numeric > highest) highest = numeric;
  }

  return (highest + BigInt(1)).toString().padStart(EMPLOYEE_ID_MIN_DIGITS, "0");
}
