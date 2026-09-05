import ExcelJS from "exceljs";
import { validateEquipmentRows, type EquipmentImportRow } from "../schemas/equipment";

export interface ImportResult {
  valid: EquipmentImportRow[];
  errors: { row: number; message: string }[];
}

const HEADER_MAP: Record<string, string> = {
  "equipment number": "equipmentNumber",
  "fleet number": "equipmentNumber",
  name: "name",
  type: "type",
  make: "make",
  model: "model",
  "operating hours": "operatingHours",
  "required certifications": "requiredCertifications",
  status: "status",
  location: "location",
};

// Parses an uploaded xlsx buffer into validated Equipment rows. See
// importMaterials.ts for the pattern this follows and why the Buffer
// cast below is needed.
export async function importEquipmentFromExcel(fileBuffer: Buffer): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { valid: [], errors: [{ row: 0, message: "No worksheet found in file" }] };
  }

  const headerRow = sheet.getRow(1).values as unknown[];
  const headers = headerRow.map((h) => (typeof h === "string" ? h.trim().toLowerCase() : ""));

  const rawRows: unknown[] = [];

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header

    const values = row.values as unknown[];
    const record: Record<string, unknown> = {};

    headers.forEach((header, colIndex) => {
      const field = HEADER_MAP[header];
      if (!field) return;
      const cellValue = values[colIndex];
      record[field] = cellValue === undefined || cellValue === null ? undefined : cellValue;
    });

    rawRows.push(record);
  });

  return validateEquipmentRows(rawRows);
}
