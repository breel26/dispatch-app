import { describe, it, expect } from "vitest";
import {
  itemKeyFor,
  rankQuotedLines,
  selectBestLine,
  compareByItem,
  summarizeJobQuotes,
  type QuotedLine,
} from "../compareQuotes";

const NOW = new Date("2026-06-15T00:00:00Z");

function line(overrides: Partial<QuotedLine> & Pick<QuotedLine, "vendorName" | "unitPrice">): QuotedLine {
  return {
    quoteId: `q-${overrides.vendorName}`,
    vendorId: `v-${overrides.vendorName}`,
    itemKey: "MATERIAL:cement",
    itemLabel: "Portland Cement",
    quantity: 10,
    ...overrides,
  };
}

describe("itemKeyFor", () => {
  it("keeps materials and equipment in separate key spaces", () => {
    // Ids come from different tables and could collide, so the type has to
    // be part of the key or two unrelated items would be compared together.
    expect(itemKeyFor("abc", null)).toBe("MATERIAL:abc");
    expect(itemKeyFor(null, "abc")).toBe("EQUIPMENT:abc");
    expect(itemKeyFor("abc", null)).not.toBe(itemKeyFor(null, "abc"));
  });

  it("refuses a line that references neither", () => {
    expect(() => itemKeyFor(null, null)).toThrow(/either a material or/);
  });
});

describe("rankQuotedLines", () => {
  it("ranks the cheapest unit price first", () => {
    const ranked = rankQuotedLines(
      [
        line({ vendorName: "Acme", unitPrice: "12.50" }),
        line({ vendorName: "Budget", unitPrice: "9.75" }),
        line({ vendorName: "Premium", unitPrice: "20.00" }),
      ],
      NOW
    );

    expect(ranked.map((l) => l.vendorName)).toEqual(["Budget", "Acme", "Premium"]);
    expect(ranked[0].rank).toBe(1);
  });

  // Vendors quote different pack sizes. Comparing extended totals would
  // rank a small quantity ahead of a genuinely cheaper bulk price.
  it("compares unit price, not the extended total", () => {
    const ranked = rankQuotedLines(
      [
        line({ vendorName: "Bulk", unitPrice: "5.00", quantity: 100 }), // $500
        line({ vendorName: "Small", unitPrice: "8.00", quantity: 2 }), //  $16
      ],
      NOW
    );

    expect(ranked[0].vendorName).toBe("Bulk");
  });

  it("breaks a price tie on the shorter lead time", () => {
    const ranked = rankQuotedLines(
      [
        line({ vendorName: "Slow", unitPrice: "10.00", leadTimeDays: 30 }),
        line({ vendorName: "Fast", unitPrice: "10.00", leadTimeDays: 3 }),
      ],
      NOW
    );

    expect(ranked[0].vendorName).toBe("Fast");
  });

  it("treats an unstated lead time as worse than any stated one", () => {
    const ranked = rankQuotedLines(
      [
        line({ vendorName: "Unknown", unitPrice: "10.00", leadTimeDays: null }),
        line({ vendorName: "Stated", unitPrice: "10.00", leadTimeDays: 45 }),
      ],
      NOW
    );

    expect(ranked[0].vendorName).toBe("Stated");
  });

  // A stale lowball must never outrank a live quote, however cheap it is.
  it("sorts expired lines last regardless of price", () => {
    const ranked = rankQuotedLines(
      [
        line({ vendorName: "Stale", unitPrice: "1.00", expiresAt: new Date("2026-06-01") }),
        line({ vendorName: "Live", unitPrice: "50.00", expiresAt: new Date("2026-07-01") }),
      ],
      NOW
    );

    expect(ranked[0].vendorName).toBe("Live");
    expect(ranked[1].isExpired).toBe(true);
  });

  it("counts a quote expiring exactly now as expired", () => {
    const ranked = rankQuotedLines(
      [line({ vendorName: "Edge", unitPrice: "1.00", expiresAt: NOW })],
      NOW
    );

    expect(ranked[0].isExpired).toBe(true);
  });

  // Money is Decimal end to end; 0.1 + 0.2 arithmetic must not creep in.
  it("extends lines exactly, without floating-point drift", () => {
    const ranked = rankQuotedLines(
      [line({ vendorName: "Acme", unitPrice: "0.10", quantity: 3 })],
      NOW
    );

    expect(ranked[0].extendedTotal.toFixed(2)).toBe("0.30");
  });

  it("compares prices numerically, not as strings", () => {
    // "9.75" > "12.50" as strings; only a numeric comparison gets this right.
    const ranked = rankQuotedLines(
      [
        line({ vendorName: "Nine", unitPrice: "9.75" }),
        line({ vendorName: "Twelve", unitPrice: "12.50" }),
      ],
      NOW
    );

    expect(ranked[0].vendorName).toBe("Nine");
  });
});

describe("selectBestLine", () => {
  it("returns the cheapest live line", () => {
    const best = selectBestLine(
      [
        line({ vendorName: "Acme", unitPrice: "12.50" }),
        line({ vendorName: "Budget", unitPrice: "9.75" }),
      ],
      NOW
    );

    expect(best?.vendorName).toBe("Budget");
  });

  // Falling back to an expired price would let someone raise a PO against
  // a number the vendor is no longer offering.
  it("returns null when every line has expired", () => {
    const best = selectBestLine(
      [
        line({ vendorName: "A", unitPrice: "1.00", expiresAt: new Date("2026-01-01") }),
        line({ vendorName: "B", unitPrice: "2.00", expiresAt: new Date("2026-02-01") }),
      ],
      NOW
    );

    expect(best).toBeNull();
  });

  it("returns null when there are no lines at all", () => {
    expect(selectBestLine([], NOW)).toBeNull();
  });
});

describe("compareByItem", () => {
  // This is the whole point of the redesign: cement is compared against
  // cement, not against a crane.
  it("compares each item separately rather than ranking across the job", () => {
    const comparisons = compareByItem(
      [
        line({ vendorName: "Acme", unitPrice: "12.00" }),
        line({ vendorName: "Budget", unitPrice: "9.00" }),
        line({
          vendorName: "CraneCo",
          unitPrice: "2000.00",
          itemKey: "EQUIPMENT:crane",
          itemLabel: "Crane rental",
        }),
      ],
      NOW
    );

    expect(comparisons).toHaveLength(2);

    const cement = comparisons.find((c) => c.itemKey === "MATERIAL:cement")!;
    const crane = comparisons.find((c) => c.itemKey === "EQUIPMENT:crane")!;

    expect(cement.best!.vendorName).toBe("Budget");
    // The expensive crane is still the winner for cranes - it is not
    // competing with bags of cement.
    expect(crane.best!.vendorName).toBe("CraneCo");
  });

  it("gives each item its own independent ranking", () => {
    const comparisons = compareByItem(
      [
        line({ vendorName: "Acme", unitPrice: "5.00" }),
        line({ vendorName: "Budget", unitPrice: "9.00" }),
        line({
          vendorName: "Acme",
          unitPrice: "300.00",
          itemKey: "MATERIAL:rebar",
          itemLabel: "Rebar",
        }),
        line({
          vendorName: "Budget",
          unitPrice: "250.00",
          itemKey: "MATERIAL:rebar",
          itemLabel: "Rebar",
        }),
      ],
      NOW
    );

    const cement = comparisons.find((c) => c.itemKey === "MATERIAL:cement")!;
    const rebar = comparisons.find((c) => c.itemKey === "MATERIAL:rebar")!;

    // Different vendors win different items - impossible to express in the
    // single-winner model this replaced.
    expect(cement.best!.vendorName).toBe("Acme");
    expect(rebar.best!.vendorName).toBe("Budget");
  });

  it("orders items by label so the table does not reshuffle between loads", () => {
    const comparisons = compareByItem(
      [
        line({ vendorName: "A", unitPrice: "1.00", itemKey: "MATERIAL:z", itemLabel: "Zinc" }),
        line({ vendorName: "B", unitPrice: "1.00", itemKey: "MATERIAL:a", itemLabel: "Aggregate" }),
      ],
      NOW
    );

    expect(comparisons.map((c) => c.itemLabel)).toEqual(["Aggregate", "Zinc"]);
  });

  it("marks an item with only expired quotes as having no best line", () => {
    const comparisons = compareByItem(
      [line({ vendorName: "Stale", unitPrice: "1.00", expiresAt: new Date("2026-01-01") })],
      NOW
    );

    expect(comparisons[0].best).toBeNull();
    expect(comparisons[0].lines).toHaveLength(1); // still shown, just not selectable
  });
});

describe("summarizeJobQuotes", () => {
  it("totals the cheapest live line for every item", () => {
    const summary = summarizeJobQuotes(
      [
        line({ vendorName: "Acme", unitPrice: "10.00", quantity: 10 }), // 100.00
        line({ vendorName: "Budget", unitPrice: "8.00", quantity: 10 }), //  80.00 <- best
        line({
          vendorName: "CraneCo",
          unitPrice: "500.00",
          quantity: 2,
          itemKey: "EQUIPMENT:crane",
          itemLabel: "Crane",
        }), // 1000.00
      ],
      NOW
    );

    expect(summary.bestCaseTotal?.toFixed(2)).toBe("1080.00");
    expect(summary.itemsWithoutUsableQuote).toEqual([]);
  });

  // A total that quietly skips an unpriced item reads as a complete number
  // and is not one. Refusing to produce it is the point.
  it("refuses to produce a total when any item lacks a usable quote", () => {
    const summary = summarizeJobQuotes(
      [
        line({ vendorName: "Acme", unitPrice: "10.00" }),
        line({
          vendorName: "Stale",
          unitPrice: "5.00",
          itemKey: "MATERIAL:rebar",
          itemLabel: "Rebar",
          expiresAt: new Date("2026-01-01"),
        }),
      ],
      NOW
    );

    expect(summary.bestCaseTotal).toBeNull();
    expect(summary.itemsWithoutUsableQuote).toEqual(["Rebar"]);
  });

  it("reports no total for a job with no quotes at all", () => {
    const summary = summarizeJobQuotes([], NOW);

    expect(summary.items).toEqual([]);
    expect(summary.bestCaseTotal).toBeNull();
  });
});
