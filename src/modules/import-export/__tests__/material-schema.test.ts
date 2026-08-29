import { describe, it, expect } from "vitest";
import { validateMaterialRows } from "../schemas/material";

describe("validateMaterialRows", () => {
  it("accepts a fully valid row", () => {
    const { valid, errors } = validateMaterialRows([
      { sku: "CEM-001", name: "Portland Cement", unit: "bag", quantityOnHand: 50 },
    ]);
    expect(errors).toHaveLength(0);
    expect(valid).toHaveLength(1);
    expect(valid[0].sku).toBe("CEM-001");
  });

  it("rejects a row missing a required field", () => {
    const { valid, errors } = validateMaterialRows([
      { name: "Portland Cement", unit: "bag", quantityOnHand: 50 }, // no sku
    ]);
    expect(valid).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("sku");
  });

  it("rejects a row with a negative quantity", () => {
    const { valid, errors } = validateMaterialRows([
      { sku: "CEM-001", name: "Portland Cement", unit: "bag", quantityOnHand: -5 },
    ]);
    expect(valid).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("quantityOnHand");
  });

  it("rejects a row where quantity is the wrong type", () => {
    const { valid, errors } = validateMaterialRows([
      { sku: "CEM-001", name: "Portland Cement", unit: "bag", quantityOnHand: "fifty" },
    ]);
    expect(valid).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });

  it("processes valid and invalid rows independently — one bad row does not block the rest", () => {
    const { valid, errors } = validateMaterialRows([
      { sku: "CEM-001", name: "Portland Cement", unit: "bag", quantityOnHand: 50 },
      { name: "Missing SKU Item", unit: "bag", quantityOnHand: 10 },
      { sku: "REBAR-01", name: "Rebar 1/2in", unit: "ft", quantityOnHand: 200 },
    ]);
    expect(valid).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(2);
  });

  it("allows reorderThreshold to be omitted", () => {
    const { valid, errors } = validateMaterialRows([
      { sku: "CEM-001", name: "Portland Cement", unit: "bag", quantityOnHand: 50 },
    ]);
    expect(errors).toHaveLength(0);
    expect(valid[0].reorderThreshold).toBeUndefined();
  });
});
