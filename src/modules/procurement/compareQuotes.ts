import { formatMoney, lineTotal, money, type Money } from "@/modules/shared/money";

// Quote comparison, per item.
//
// This module used to rank every quote on a job into a single list and
// return "the best" one. That only worked because a Quote carried exactly
// one price - which was itself the modelling error. Ranking a concrete
// quote against a crane rental produces a winner that means nothing.
//
// Now a vendor quotes every line it was asked about, and comparison
// happens within one item: for these 200 bags of cement, who is cheapest?
// A job's comparison is a list of those, one per requested item.

// Identifies which material or piece of equipment a line is for, so lines
// from different vendors can be grouped. Materials and equipment have
// separate id spaces, so the type has to be part of the key.
export function itemKeyFor(
  materialId: string | null | undefined,
  equipmentId: string | null | undefined
): string {
  if (materialId) return `MATERIAL:${materialId}`;
  if (equipmentId) return `EQUIPMENT:${equipmentId}`;
  throw new Error("A quoted line must reference either a material or a piece of equipment");
}

export interface QuotedLine {
  quoteId: string;
  vendorId: string;
  vendorName: string;
  itemKey: string;
  itemLabel: string;
  quantity: number;
  unitPrice: Money | string | number;
  leadTimeDays?: number | null;
  expiresAt?: Date | null;
}

export interface RankedQuoteLine extends QuotedLine {
  unitPriceAmount: Money;
  extendedTotal: Money;
  isExpired: boolean;
  rank: number; // 1 = best. Expired lines rank after every valid one.
}

export interface ItemComparison {
  itemKey: string;
  itemLabel: string;
  quantity: number;
  lines: RankedQuoteLine[];
  // The cheapest non-expired line, or null when every vendor's price for
  // this item has lapsed. Callers must treat null as "go get fresh
  // quotes", never as "fall back to the expired price".
  best: RankedQuoteLine | null;
}

function isExpiredAt(line: QuotedLine, now: Date): boolean {
  return line.expiresAt != null && line.expiresAt.getTime() <= now.getTime();
}

// Ranks the lines quoted for one item. Primary sort is UNIT price, not the
// extended total: vendors quote different pack sizes, and the per-unit
// figure is the only apples-to-apples comparison when the quantities on
// two quotes differ. Ties break on lead time (shorter first). Expired
// lines always sort last regardless of price, so a stale lowball cannot
// look like the winner.
export function rankQuotedLines(lines: QuotedLine[], now: Date = new Date()): RankedQuoteLine[] {
  const priced = lines.map((line) => {
    const unitPriceAmount = money(line.unitPrice);
    return {
      ...line,
      unitPriceAmount,
      extendedTotal: lineTotal(line.quantity, unitPriceAmount),
      isExpired: isExpiredAt(line, now),
    };
  });

  const sorted = [...priced].sort((a, b) => {
    if (a.isExpired !== b.isExpired) return a.isExpired ? 1 : -1;

    const byPrice = a.unitPriceAmount.comparedTo(b.unitPriceAmount);
    if (byPrice !== 0) return byPrice;

    const aLead = a.leadTimeDays ?? Number.POSITIVE_INFINITY;
    const bLead = b.leadTimeDays ?? Number.POSITIVE_INFINITY;
    return aLead - bLead;
  });

  return sorted.map((line, index) => ({ ...line, rank: index + 1 }));
}

export function selectBestLine(
  lines: QuotedLine[],
  now: Date = new Date()
): RankedQuoteLine | null {
  const ranked = rankQuotedLines(lines, now);
  const best = ranked[0];
  if (!best || best.isExpired) return null;
  return best;
}

// Groups every quoted line on a job by the item it prices, and ranks each
// group independently. Items are returned in stable label order so the
// comparison table does not reshuffle between page loads.
export function compareByItem(lines: QuotedLine[], now: Date = new Date()): ItemComparison[] {
  const groups = new Map<string, QuotedLine[]>();
  for (const line of lines) {
    const existing = groups.get(line.itemKey);
    if (existing) existing.push(line);
    else groups.set(line.itemKey, [line]);
  }

  return Array.from(groups.entries())
    .map(([itemKey, groupLines]) => {
      const ranked = rankQuotedLines(groupLines, now);
      const best = ranked.find((line) => !line.isExpired) ?? null;
      return {
        itemKey,
        itemLabel: groupLines[0].itemLabel,
        quantity: groupLines[0].quantity,
        lines: ranked,
        best,
      };
    })
    .sort((a, b) => a.itemLabel.localeCompare(b.itemLabel));
}

export interface JobQuoteSummary {
  items: ItemComparison[];
  // Total if every item were bought from its own cheapest vendor. Null
  // when any item has no usable quote, because a "best total" that
  // silently omits an unpriced item is worse than no number at all.
  bestCaseTotal: Money | null;
  itemsWithoutUsableQuote: string[];
}

export function summarizeJobQuotes(
  lines: QuotedLine[],
  now: Date = new Date()
): JobQuoteSummary {
  const items = compareByItem(lines, now);
  const itemsWithoutUsableQuote = items
    .filter((item) => item.best === null)
    .map((item) => item.itemLabel);

  const bestCaseTotal =
    items.length > 0 && itemsWithoutUsableQuote.length === 0
      ? items.reduce<Money>(
          (total, item) => total.plus(item.best!.extendedTotal),
          money(0)
        )
      : null;

  return { items, bestCaseTotal, itemsWithoutUsableQuote };
}

// Convenience for rendering: "$12.50/bag" style unit pricing.
export function formatUnitPrice(unitPrice: Money | string | number, unit?: string): string {
  const formatted = formatMoney(unitPrice);
  return unit ? `${formatted}/${unit}` : formatted;
}
