import { describe, it, expect } from "vitest";
import { vendorMatchesCategory, filterVendorsByCategory } from "../matching";

const vendors = [
  { id: "1", name: "ABC Concrete", categories: ["Concrete", "Aggregate"] },
  { id: "2", name: "Big Iron Rentals", categories: ["equipment rental"] },
  { id: "3", name: "Steel Supply Co", categories: ["Rebar", "Steel"] },
];

describe("vendorMatchesCategory", () => {
  it("matches an exact category", () => {
    expect(vendorMatchesCategory(vendors[0], "Concrete")).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(vendorMatchesCategory(vendors[0], "concrete")).toBe(true);
    expect(vendorMatchesCategory(vendors[1], "EQUIPMENT RENTAL")).toBe(true);
  });

  it("matches with surrounding whitespace trimmed", () => {
    expect(vendorMatchesCategory(vendors[0], "  Concrete  ")).toBe(true);
  });

  it("does not match an unrelated category", () => {
    expect(vendorMatchesCategory(vendors[0], "Electrical")).toBe(false);
  });

  it("returns false for a vendor with no categories", () => {
    expect(vendorMatchesCategory({ id: "4", name: "Nobody", categories: [] }, "Concrete")).toBe(false);
  });
});

describe("filterVendorsByCategory", () => {
  it("returns only vendors matching the category", () => {
    const result = filterVendorsByCategory(vendors, "steel");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("3");
  });

  it("returns an empty array when nothing matches", () => {
    const result = filterVendorsByCategory(vendors, "plumbing");
    expect(result).toHaveLength(0);
  });

  it("returns multiple matches when applicable", () => {
    const result = filterVendorsByCategory(
      [...vendors, { id: "5", name: "Another Concrete Co", categories: ["Concrete"] }],
      "concrete"
    );
    expect(result).toHaveLength(2);
  });
});
