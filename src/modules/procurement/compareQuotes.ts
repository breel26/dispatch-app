export interface ComparableQuote {
  id: string;
  vendorId: string;
  vendorName: string;
  price: number;
  leadTimeDays?: number | null;
  expiresAt?: Date | null;
}

export interface RankedQuote extends ComparableQuote {
  isExpired: boolean;
  rank: number; // 1 = best. Expired quotes are ranked last, after all valid ones.
}

// Excludes quotes that have expired as of `now` from being considered
// "the best" — an expired quote can still be shown to the user, but
// should never be silently selected as the winner.
function isQuoteExpired(quote: ComparableQuote, now: Date): boolean {
  return quote.expiresAt != null && quote.expiresAt.getTime() <= now.getTime();
}

// Ranks quotes for comparison. Primary sort: price (lowest first).
// Ties broken by lead time (shorter first) when both quotes specify one.
// Expired quotes always sort after all non-expired quotes, regardless
// of price, so a stale lowball quote can't look like the winner.
export function rankQuotes(
  quotes: ComparableQuote[],
  now: Date = new Date()
): RankedQuote[] {
  const withExpiry = quotes.map((q) => ({
    ...q,
    isExpired: isQuoteExpired(q, now),
  }));

  const sorted = [...withExpiry].sort((a, b) => {
    if (a.isExpired !== b.isExpired) {
      return a.isExpired ? 1 : -1; // non-expired first
    }
    if (a.price !== b.price) {
      return a.price - b.price;
    }
    const aLead = a.leadTimeDays ?? Infinity;
    const bLead = b.leadTimeDays ?? Infinity;
    return aLead - bLead;
  });

  return sorted.map((q, index) => ({ ...q, rank: index + 1 }));
}

// Returns the best (rank 1) non-expired quote, or null if every quote
// provided has expired. Callers should treat a null result as "need to
// request fresh quotes," not silently fall back to an expired price.
export function selectBestQuote(
  quotes: ComparableQuote[],
  now: Date = new Date()
): RankedQuote | null {
  const ranked = rankQuotes(quotes, now);
  const best = ranked[0];
  if (!best || best.isExpired) return null;
  return best;
}
