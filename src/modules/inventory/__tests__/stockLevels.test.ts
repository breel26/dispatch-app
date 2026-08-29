import { describe, it, expect } from "vitest";
import { checkStockLevel, findLowStockMaterials, hasSufficientStock } from "../stockLevels";

describe("checkStockLevel", () => {
  it("flags out of stock when quantity is zero", () => {
    const result = checkStockLevel({ id: "1", sku: "A", name: "Cement", quantityOnHand: 0 });
    expect(result.isOutOfStock).toBe(true);
    expect(result.isLowStock).toBe(false);
  });

  it("flags out of stock when quantity is negative", () => {
    const result = checkStockLevel({ id: "1", sku: "A", name: "Cement", quantityOnHand: -5 });
    expect(result.isOutOfStock).toBe(true);
  });

  it("flags low stock when quantity is at or below threshold", () => {
    const result = checkStockLevel({
      id: "1", sku: "A", name: "Cement", quantityOnHand: 10, reorderThreshold: 10,
    });
    expect(result.isLowStock).toBe(true);
    expect(result.isOutOfStock).toBe(false);
  });

  it("does not flag low stock when quantity is above threshold", () => {
    const result = checkStockLevel({
      id: "1", sku: "A", name: "Cement", quantityOnHand: 50, reorderThreshold: 10,
    });
    expect(result.isLowStock).toBe(false);
  });

  it("never flags low stock when no threshold is set, regardless of quantity", () => {
    const result = checkStockLevel({ id: "1", sku: "A", name: "Cement", quantityOnHand: 1 });
    expect(result.isLowStock).toBe(false);
  });

  it("out-of-stock takes precedence over low-stock in the flags (mutually exclusive)", () => {
    const result = checkStockLevel({
      id: "1", sku: "A", name: "Cement", quantityOnHand: 0, reorderThreshold: 10,
    });
    expect(result.isOutOfStock).toBe(true);
    expect(result.isLowStock).toBe(false);
  });
});

describe("findLowStockMaterials", () => {
  it("returns only materials that are low or out of stock", () => {
    const materials = [
      { id: "1", sku: "A", name: "Cement", quantityOnHand: 50, reorderThreshold: 10 },
      { id: "2", sku: "B", name: "Rebar", quantityOnHand: 5, reorderThreshold: 10 },
      { id: "3", sku: "C", name: "Sand", quantityOnHand: 0, reorderThreshold: 20 },
    ];
    const result = findLowStockMaterials(materials);
    expect(result.map((m) => m.id)).toEqual(["2", "3"]);
  });

  it("returns an empty array when everything is well-stocked", () => {
    const materials = [
      { id: "1", sku: "A", name: "Cement", quantityOnHand: 50, reorderThreshold: 10 },
    ];
    expect(findLowStockMaterials(materials)).toEqual([]);
  });
});

describe("hasSufficientStock", () => {
  it("returns true when stock covers the request", () => {
    const material = { id: "1", sku: "A", name: "Cement", quantityOnHand: 50 };
    expect(hasSufficientStock(material, 20)).toBe(true);
  });

  it("returns true when stock exactly matches the request", () => {
    const material = { id: "1", sku: "A", name: "Cement", quantityOnHand: 20 };
    expect(hasSufficientStock(material, 20)).toBe(true);
  });

  it("returns false when stock is insufficient", () => {
    const material = { id: "1", sku: "A", name: "Cement", quantityOnHand: 10 };
    expect(hasSufficientStock(material, 20)).toBe(false);
  });

  it("throws for a zero or negative requested quantity", () => {
    const material = { id: "1", sku: "A", name: "Cement", quantityOnHand: 10 };
    expect(() => hasSufficientStock(material, 0)).toThrow();
    expect(() => hasSufficientStock(material, -5)).toThrow();
  });
});
