import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { importEquipmentFromExcel } from "../excel/importEquipment";
import { planImport } from "../importPlan";
import type { EquipmentImportRow } from "../schemas/equipment";
import { nextEquipmentNumber, parseEquipmentNumber } from "@/modules/inventory/equipmentNumber";

const HEADERS = [
  "Equipment Number",
  "Name",
  "Type",
  "Make",
  "Model",
  "Operating Hours",
  "Status",
];

/**
 * Builds a real xlsx the way a dispatcher's file arrives, rather than
 * hand-feeding objects to the validator. `null` in `rows` writes a blank
 * spreadsheet row, which is the case row numbering is most likely to get
 * wrong.
 */
async function buildWorkbook(rows: (string[] | null)[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Equipment");
  sheet.addRow(HEADERS);
  for (const row of rows) {
    sheet.addRow(row ?? []);
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function machine(equipmentNumber: string, make: string, model: string): string[] {
  return [equipmentNumber, "Company Owned", "Excavator", make, model, "100", "AVAILABLE"];
}

function planEquipment(
  valid: { row: number; data: EquipmentImportRow }[],
  existing: { key: string; label: string }[]
) {
  return planImport<EquipmentImportRow>({
    rows: valid,
    keyOf: (row) => row.equipmentNumber,
    describeRow: (row) => `${row.make} ${row.model} - ${row.name}`,
    existing,
    suggest: (row, taken) => {
      const parts = parseEquipmentNumber(row.equipmentNumber);
      if (!parts) return null;
      return nextEquipmentNumber(taken, parts.type, parts.capacity);
    },
  });
}

describe("equipment import clash detection, end to end from a real xlsx", () => {
  it("detects a clash with the fleet and suggests the next free number", async () => {
    const buffer = await buildWorkbook([
      machine("03-05-0004", "Caterpillar", "336"),
      machine("03-05-0009", "Deere", "350G"),
    ]);

    const { valid, errors } = await importEquipmentFromExcel(buffer);
    expect(errors).toEqual([]);

    const plan = planEquipment(valid, [
      { key: "03-05-0004", label: "Komatsu PC210 - Company Owned" },
      { key: "03-05-0007", label: "Volvo EC220 - Company Owned" },
    ]);

    // Row 1 collides with the Komatsu; row 2 is free.
    expect(plan[0].clash).toMatchObject({
      source: "database",
      heldBy: "Komatsu PC210 - Company Owned",
      likelyDifferent: true,
      // 0007 is the highest in this family, and 0005/0006 are gaps that
      // stay unfilled.
      suggestion: "03-05-0008",
    });
    expect(plan[1].clash).toBeNull();
  });

  it("recognizes a straight re-import as an update rather than a collision", async () => {
    const buffer = await buildWorkbook([machine("03-05-0004", "Komatsu", "PC210")]);

    const { valid } = await importEquipmentFromExcel(buffer);
    const plan = planEquipment(valid, [
      { key: "03-05-0004", label: "Komatsu PC210 - Company Owned" },
    ]);

    expect(plan[0].clash?.likelyDifferent).toBe(false);
  });

  it("catches a number the spreadsheet lists twice", async () => {
    const buffer = await buildWorkbook([
      machine("03-05-0004", "Caterpillar", "336"),
      machine("03-05-0004", "Deere", "350G"),
    ]);

    const { valid } = await importEquipmentFromExcel(buffer);
    const plan = planEquipment(valid, []);

    expect(plan[0].clash).toBeNull();
    expect(plan[1].clash).toMatchObject({ source: "file", heldBy: "row 1" });
    // The suggestion has to clear the number row 1 is about to take.
    expect(plan[1].clash?.suggestion).toBe("03-05-0005");
  });

  it("keeps row numbers aligned with the spreadsheet across a blank row", async () => {
    // The comment in importEquipment.ts claims ExcelJS skips empty rows, so
    // a running counter would drift. This proves both halves: the blank row
    // is skipped, and the row after it still reports as data row 3.
    const buffer = await buildWorkbook([
      machine("03-05-0001", "Caterpillar", "336"),
      null,
      machine("03-05-0002", "Deere", "350G"),
    ]);

    const { valid } = await importEquipmentFromExcel(buffer);

    expect(valid).toHaveLength(2);
    expect(valid.map((row) => row.row)).toEqual([1, 3]);
  });

  it("reports a validation failure and a clash against the same row numbers", async () => {
    // Row 2 is invalid (unregistered type code 99). Row 3 clashes. If the
    // clash were numbered by its position among the valid rows it would
    // come back as row 2 - the number the dispatcher would use to find the
    // wrong line in their spreadsheet.
    const buffer = await buildWorkbook([
      machine("03-05-0001", "Caterpillar", "336"),
      machine("99-05-0001", "Broken", "Row"),
      machine("03-05-0002", "Deere", "350G"),
    ]);

    const { valid, errors } = await importEquipmentFromExcel(buffer);

    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(2);

    const plan = planEquipment(valid, [
      { key: "03-05-0002", label: "Volvo EC220 - Company Owned" },
    ]);

    const clashing = plan.filter((planned) => planned.clash);
    expect(clashing).toHaveLength(1);
    expect(clashing[0].row).toBe(3);
  });
});
