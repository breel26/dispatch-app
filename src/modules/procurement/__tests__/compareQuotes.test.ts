import { describe, it, expect } from "vitest";
import { rankQuotes, selectBestQuote, type ComparableQuote } from "../compareQuotes";

const now = new Date("2026-06-15T00:00:00Z");

function quote(overrides: Partial<ComparableQuote>): ComparableQuote {
  return {
    id: "q1",
    vendorId: "v1",
    vendorName: "Vendor",
    price: 100,
    ...overrides,
  };
}

describe("rankQuotes", () => {
  it("ranks the lowest price first", () => {
    const quotes = [
      quote({ id: "q1", price: 300 }),
      quote({ id: "q2", price: 100 }),
      quote({ id: "q3", price: 200 }),
    ];
    const ranked = rankQuotes(quotes, now);
    expect(ranked.map((q) => q.id)).toEqual(["q2", "q3", "q1"]);
    expect(ranked[0].rank).toBe(1);
  });

  it("breaks a price tie using the shorter lead time", () => {
    const quotes = [
      quote({ id: "q1", price: 100, leadTimeDays: 10 }),
      quote({ id: "q2", price: 100, leadTimeDays: 3 }),
    ];
    const ranked = rankQuotes(quotes, now);
    expect(ranked[0].id).toBe("q2");
  });

  it("treats a missing lead time as worse than any specified lead time in a tie", () => {
    const quotes = [
      quote({ id: "q1", price: 100, leadTimeDays: undefined }),
      quote({ id: "q2", price: 100, leadTimeDays: 30 }),
    ];
    const ranked = rankQuotes(quotes, now);
    expect(ranked[0].id).toBe("q2");
  });

  it("sorts expired quotes after all non-expired quotes regardless of price", () => {
    const quotes = [
      quote({ id: "cheap-but-expired", price: 50, expiresAt: new Date("2026-01-01") }),
      quote({ id: "pricier-but-valid", price: 500, expiresAt: new Date("2026-12-01") }),
    ];
    const ranked = rankQuotes(quotes, now);
    expect(ranked[0].id).toBe("pricier-but-valid");
    expect(ranked[0].isExpired).toBe(false);
    expect(ranked[1].id).toBe("cheap-but-expired");
    expect(ranked[1].isExpired).toBe(true);
  });

  it("treats a quote with no expiresAt as never expired", () => {
    const quotes = [quote({ id: "q1", expiresAt: undefined })];
    const ranked = rankQuotes(quotes, now);
    expect(ranked[0].isExpired).toBe(false);
  });

  it("treats a quote expiring exactly now as expired", () => {
    const quotes = [quote({ id: "q1", expiresAt: now })];
    const ranked = rankQuotes(quotes, now);
    expect(ranked[0].isExpired).toBe(true);
  });

  it("returns an empty array for no quotes", () => {
    expect(rankQuotes([], now)).toEqual([]);
  });
});

describe("selectBestQuote", () => {
  it("returns the cheapest non-expired quote", () => {
    const quotes = [
      quote({ id: "q1", price: 300 }),
      quote({ id: "q2", price: 100 }),
    ];
    const best = selectBestQuote(quotes, now);
    expect(best?.id).toBe("q2");
  });

  it("skips an expired lowest-price quote in favor of a valid one", () => {
    const quotes = [
      quote({ id: "expired-cheap", price: 10, expiresAt: new Date("2020-01-01") }),
      quote({ id: "valid-pricier", price: 200, expiresAt: new Date("2027-01-01") }),
    ];
    const best = selectBestQuote(quotes, now);
    expect(best?.id).toBe("valid-pricier");
  });

  it("returns null when every quote has expired", () => {
    const quotes = [
      quote({ id: "q1", price: 10, expiresAt: new Date("2020-01-01") }),
      quote({ id: "q2", price: 20, expiresAt: new Date("2020-06-01") }),
    ];
    expect(selectBestQuote(quotes, now)).toBeNull();
  });

  it("returns null for an empty quote list", () => {
    expect(selectBestQuote([], now)).toBeNull();
  });
});
