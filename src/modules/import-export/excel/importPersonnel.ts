import ExcelJS from "exceljs";
import { validatePersonnelRows, type PersonnelImportRow } from "../schemas/personnel";
import type { RawRow, RowValidationResult } from "../rows";

export type ImportResult = RowValidationResult<PersonnelImportRow>;

const HEADER_MAP: Record<string, string> = {
  "employee id": "employeeId",
  "first name": "firstName",
  "middle name": "middleName",
  "last name": "lastName",
  "date of birth": "dateOfBirth",
  "hire date": "hireDate",
  ssn: "ssn",
  "social security number": "ssn",
  "driver's license number": "driversLicenseNumber",
  "drivers license number": "driversLicenseNumber",
  "street address": "homeStreet1",
  "street address 2": "homeStreet2",
  city: "homeCity",
  state: "homeState",
  "postal code": "homePostalCode",
  country: "homeCountry",
  "phone number": "phoneNumber",
  craft: "craft",
  classification: "classification",
  certifications: "certifications",
  active: "isActive",
};

// Parses an uploaded xlsx buffer into validated Personnel rows.
//
// SSN and driver's license number pass through this function as plain
// text, exactly as they were in the uploaded file - this module only
// gets them from a spreadsheet cell into a validated in-memory object.
// They are never written to disk here (no temp file, matching the
// project's import/export pattern) and are only ever encrypted once a
// caller passes a valid row to modules/inventory/repository.ts's
// createPersonnel, which is the sole place that calls encryptPii. Every
// row that fails validation is reported rather than silently dropped, so
// a malformed SSN in row 40 does not read as "row 40 does not exist".
export async function importPersonnelFromExcel(fileBuffer: Buffer): Promise<ImportResult> {
  const workbook = new ExcelJS.Workbook();
  // See importMaterials.ts for why this cast is needed - ExcelJS's own
  // .d.ts pins a Buffer type that predates Node's generic Buffer<T>.
  await workbook.xlsx.load(fileBuffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return { valid: [], errors: [{ row: 0, message: "No worksheet found in file" }] };
  }

  const headerRow = sheet.getRow(1).values as unknown[];
  const headers = headerRow.map((h) => (typeof h === "string" ? h.trim().toLowerCase() : ""));

  const rawRows: RawRow[] = [];

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

    // rowNumber is the real sheet row, so subtracting the header gives
    // the data-row number a dispatcher would count - stable even if
    // ExcelJS skipped a blank row above this one.
    rawRows.push({ row: rowNumber - 1, raw: record });
  });

  return validatePersonnelRows(rawRows);
}
