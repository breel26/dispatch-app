import ExcelJS from "exceljs";
import type { MaterialInput } from "../schemas/material";

// Builds an in-memory xlsx Buffer from a list of already-typed material
// records. Callers are responsible for fetching the DB rows and shaping
// them into MaterialInput before calling this — this function only
// handles the JSON -> spreadsheet step, per the import-export pattern
// described in CLAUDE.md.
export async function exportMaterialsToExcel(
  materials: MaterialInput[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Materials");

  sheet.columns = [
    { header: "SKU", key: "sku", width: 20 },
    { header: "Name", key: "name", width: 30 },
    { header: "Unit", key: "unit", width: 15 },
    { header: "Quantity On Hand", key: "quantityOnHand", width: 18 },
    { header: "Reorder Threshold", key: "reorderThreshold", width: 18 },
  ];

  for (const material of materials) {
    sheet.addRow(material);
  }

  sheet.getRow(1).font = { bold: true };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
