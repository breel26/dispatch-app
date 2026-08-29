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
