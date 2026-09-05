import ExcelJS from "exceljs";

// Deliberately excludes ssn and driversLicenseNumber. This function only
// ever receives what the caller chooses to put in it, and no caller in
// this codebase should ever decrypt those fields just to put them in a
// file that leaves the server - see the note on Personnel.ssnEncrypted in
// schema.prisma. If a real payroll export ever needs SSN, that is a
// distinct, explicitly-authorized export path, not this one.
export interface PersonnelExportRow {
  employeeId: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  dateOfBirth: Date;
  hireDate: Date;
  homeStreet1: string;
  homeStreet2: string | null;
  homeCity: string;
  homeState: string;
  homePostalCode: string;
  homeCountry: string;
  phoneNumber: string;
  craft: string;
  classification: string;
  certifications: string[];
  isActive: boolean;
}

export async function exportPersonnelToExcel(rows: PersonnelExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Personnel");

  sheet.columns = [
    { header: "Employee ID", key: "employeeId", width: 14 },
    { header: "First Name", key: "firstName", width: 16 },
    { header: "Middle Name", key: "middleName", width: 16 },
    { header: "Last Name", key: "lastName", width: 16 },
    { header: "Date of Birth", key: "dateOfBirth", width: 14 },
    { header: "Hire Date", key: "hireDate", width: 14 },
    { header: "Street Address", key: "homeStreet1", width: 24 },
    { header: "Street Address 2", key: "homeStreet2", width: 18 },
    { header: "City", key: "homeCity", width: 16 },
    { header: "State", key: "homeState", width: 8 },
    { header: "Postal Code", key: "homePostalCode", width: 12 },
    { header: "Country", key: "homeCountry", width: 10 },
    { header: "Phone Number", key: "phoneNumber", width: 16 },
    { header: "Craft", key: "craft", width: 14 },
    { header: "Classification", key: "classification", width: 16 },
    { header: "Certifications", key: "certifications", width: 30 },
    { header: "Active", key: "isActive", width: 10 },
  ];

  for (const row of rows) {
    sheet.addRow({ ...row, certifications: row.certifications.join(", ") });
  }

  sheet.getRow(1).font = { bold: true };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
