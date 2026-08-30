import { describe, it, expect } from "vitest";
import { toQuoteRequestEmailItems } from "../quoteRequestEmailItems";

describe("toQuoteRequestEmailItems", () => {
  it("maps a material item using the material's own unit", () => {
    const result = toQuoteRequestEmailItems([
      { quantity: 12, material: { name: "3000 psi concrete", unit: "CY" }, equipment: null },
    ]);
    expect(result).toEqual([{ description: "3000 psi concrete", quantity: 12, unit: "CY" }]);
  });

  it("maps an equipment item to the per-item unit", () => {
    const result = toQuoteRequestEmailItems([
      { quantity: 2, material: null, equipment: { name: "Excavator" } },
    ]);
    expect(result).toEqual([{ description: "Excavator", quantity: 2, unit: "ea" }]);
  });

  it("maps a mixed list preserving order", () => {
    const result = toQuoteRequestEmailItems([
      { quantity: 5, material: { name: "Rebar #4", unit: "linear ft" }, equipment: null },
      { quantity: 1, material: null, equipment: { name: "Skid steer" } },
    ]);
    expect(result.map((i) => i.description)).toEqual(["Rebar #4", "Skid steer"]);
  });

  it("throws on an item with neither material nor equipment", () => {
    expect(() =>
      toQuoteRequestEmailItems([{ quantity: 3, material: null, equipment: null }])
    ).toThrow(/neither a material nor equipment/);
  });

  it("reports the index of the offending item so it can be found", () => {
    expect(() =>
      toQuoteRequestEmailItems([
        { quantity: 5, material: { name: "Rebar #4", unit: "linear ft" }, equipment: null },
        { quantity: 3, material: null, equipment: null },
      ])
    ).toThrow(/index 1/);
  });

  it("returns an empty list for no items (the email builder rejects it downstream)", () => {
    expect(toQuoteRequestEmailItems([])).toEqual([]);
  });
});
