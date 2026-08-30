// Formats a raw sequence integer into the PO number string stored on
// PurchaseOrder.poNumber. Kept separate from the DB increment (see
// repository.ts's nextPoNumber) so the formatting rule itself — easy to
// get subtly wrong (padding width, prefix) — is unit tested directly.
const PO_NUMBER_PREFIX = "PO-";
const PO_NUMBER_PAD_WIDTH = 6;

export function formatPoNumber(sequenceValue: number): string {
  if (!Number.isInteger(sequenceValue) || sequenceValue < 1) {
    throw new Error(`Invalid PO sequence value: ${sequenceValue}`);
  }
  return `${PO_NUMBER_PREFIX}${String(sequenceValue).padStart(PO_NUMBER_PAD_WIDTH, "0")}`;
}

// Parses a formatted PO number back into its raw sequence integer.
// Useful for reconciliation/import scenarios. Returns null (rather than
// throwing) for anything that doesn't match the expected format, so
// callers can validate user-supplied PO numbers without a try/catch.
export function parsePoNumber(poNumber: string): number | null {
  const pattern = new RegExp(`^${PO_NUMBER_PREFIX}(\\d{${PO_NUMBER_PAD_WIDTH}})$`);
  const match = poNumber.match(pattern);
  if (!match) return null;
  return parseInt(match[1], 10);
}

// Dispatchers look PO numbers up off printed orders, vendor emails, and
// phone calls, where they rarely arrive in the exact stored form: "47",
// "po-47", and "PO 000047" all mean "PO-000047". Normalizes any of those
// into the canonical stored string, so a lookup doesn't fail on
// formatting alone. Returns null when the input isn't a PO number at all,
// which lets callers tell "that isn't a PO number" apart from "no PO has
// that number" — two different messages for the dispatcher.
//
// Deliberately more permissive than parsePoNumber, which validates the
// exact stored format. This one cleans up human input; that one checks
// machine output.
export function normalizePoNumberInput(raw: string): string | null {
  // Tolerates the prefix being absent, lowercase, or separated by a
  // space/underscore rather than the canonical hyphen. The literal "PO"
  // here tracks PO_NUMBER_PREFIX above — change both together.
  const digits = raw.trim().toUpperCase().replace(/^PO[\s_-]*/, "");
  if (!/^\d+$/.test(digits)) return null;

  const sequenceValue = Number(digits);
  // A digit string longer than ~15 chars silently loses precision in
  // Number(), which would look up a *different* PO rather than failing
  // visibly. Reject it instead.
  if (!Number.isSafeInteger(sequenceValue) || sequenceValue < 1) return null;

  return formatPoNumber(sequenceValue);
}
