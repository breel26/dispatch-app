import ExcelJS from "exceljs";
import { validateMaterialRows, type MaterialInput } from "../schemas/material";

export interface ImportResult {
  valid: MaterialInput[];
  errors: { row: number; message: string }[];
}

// Parses an uploaded xlsx buffer into validated Material rows.
// Rows that fail validation are reported but do not block the rest of
// the import (see validateMaterialRows). This function never writes to
// the database directly — that's the caller's job, once it decides what
// to do with `valid` vs `errors`.
export async function importMaterialsFromExcel(
  fileBuffer: Buffer
): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS's own .d.ts (via its fast-csv dependency) pins an old
  // @types/node@14 Buffer definition that predates Node's generic
  // Buffer<T> type, so TS sees two incompatible Buffer types here even
  // though this is a real, correct Buffer at runtime. Narrow cast only
  // to bridge that mismatch — not weakening our own types.
  await workbook.xlsx.load(
    fileBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]
  );

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { valid: [], errors: [{ row: 0, message: "No worksheet found in file" }] };
  }

  const headerRow = sheet.getRow(1).values as unknown[];
  const headers = headerRow.map((h) =>
    typeof h === "string" ? h.trim().toLowerCase() : ""
  );

  const headerMap: Record<string, string> = {
    sku: "sku",
    name: "name",
    unit: "unit",
    "quantity on hand": "quantityOnHand",
    "reorder threshold": "reorderThreshold",
  };

  const rawRows: unknown[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header

    const values = row.values as unknown[];
    const record: Record<string, unknown> = {};

    headers.forEach((header, colIndex) => {
      const field = headerMap[header];
      if (!field) return;
      const cellValue = values[colIndex];
      record[field] = cellValue === undefined || cellValue === null ? undefined : cellValue;
    });

    rawRows.push(record);
  });

  return validateMaterialRows(rawRows);
}
