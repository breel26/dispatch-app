import { describe, it, expect } from "vitest";
import { exportMaterialsToExcel } from "../excel/exportMaterials";
import { importMaterialsFromExcel } from "../excel/importMaterials";

describe("materials excel round-trip", () => {
  it("exports materials to xlsx and imports them back with the same data", async () => {
    const original = [
      { sku: "CEM-001", name: "Portland Cement", unit: "bag", quantityOnHand: 50, reorderThreshold: 10 },
      { sku: "REBAR-01", name: "Rebar 1/2in", unit: "ft", quantityOnHand: 200, reorderThreshold: null },
    ];

    const buffer = await exportMaterialsToExcel(original);
    expect(buffer.length).toBeGreaterThan(0);

    const result = await importMaterialsFromExcel(buffer);

    expect(result.errors).toHaveLength(0);
    expect(result.valid).toHaveLength(2);
    expect(result.valid[0].sku).toBe("CEM-001");
    expect(result.valid[0].quantityOnHand).toBe(50);
    expect(result.valid[1].sku).toBe("REBAR-01");
    expect(result.valid[1].quantityOnHand).toBe(200);
  });

  it("reports a clear error for a spreadsheet with a missing required column value", async () => {
    // Simulate a bad upload directly (not from our own export) since a
    // hand-edited vendor spreadsheet is the realistic failure case.
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Materials");
    sheet.columns = [
      { header: "SKU", key: "sku" },
      { header: "Name", key: "name" },
      { header: "Unit", key: "unit" },
      { header: "Quantity On Hand", key: "quantityOnHand" },
    ];
    sheet.addRow({ name: "Mystery Item", unit: "bag", quantityOnHand: 5 }); // no sku

    const arrayBuffer = await workbook.xlsx.writeBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await importMaterialsFromExcel(buffer);

    expect(result.valid).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain("sku");
  });
});
