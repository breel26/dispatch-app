import type { QuoteRequestEmailItem } from "@/modules/vendors/quoteRequestEmail";

// Materials carry their own unit ("CY", "bag", "linear ft"); equipment
// has no unit column in the schema, so it's quoted per-item.
const EQUIPMENT_UNIT = "ea";

// The shape this needs from a QuoteRequestItem, declared structurally
// rather than importing Prisma's generated type — keeps this function
// (and its tests) runnable without a generated client, matching how
// quoteRequestEmail.ts stays pure.
export interface QuoteRequestItemWithResource {
  quantity: number;
  material: { name: string; unit: string } | null;
  equipment: { name: string } | null;
}

// Maps stored quote-request line items into the description/quantity/unit
// shape the vendor email template expects. Split out from the send call
// so the part that's easy to get subtly wrong (a missing item, the wrong
// unit, an item with neither resource attached) is unit testable.
export function toQuoteRequestEmailItems(
  items: QuoteRequestItemWithResource[]
): QuoteRequestEmailItem[] {
  return items.map((item, index) => {
    if (item.material) {
      return {
        description: item.material.name,
        quantity: item.quantity,
        unit: item.material.unit,
      };
    }
    if (item.equipment) {
      return {
        description: item.equipment.name,
        quantity: item.quantity,
        unit: EQUIPMENT_UNIT,
      };
    }
    // Schema-wise both FKs are nullable, so a row with neither is
    // representable. Fail loudly rather than emailing a vendor an item
    // line with a blank description.
    throw new Error(
      `Quote request item at index ${index} has neither a material nor equipment attached`
    );
  });
}
