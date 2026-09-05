import { describe, it, expect } from "vitest";
import { exportPersonnelToExcel } from "../excel/exportPersonnel";
import { importPersonnelFromExcel } from "../excel/importPersonnel";

describe("personnel excel round-trip", () => {
  it("exports personnel to xlsx and imports them back with the same data", async () => {
    const original = [
      {
        employeeId: "000010",
        firstName: "Jamie",
        middleName: null,
        lastName: "Rivera",
        dateOfBirth: new Date("1988-04-12"),
        hireDate: new Date("2021-03-01"),
        homeStreet1: "500 Oak Ave",
        homeStreet2: null,
        homeCity: "Fresno",
        homeState: "CA",
        homePostalCode: "93701",
        homeCountry: "US",
        phoneNumber: "(559) 555-0110",
        craft: "CARPENTER",
        classification: "JOURNEYMAN",
        certifications: ["OSHA-30"],
        isActive: true,
      },
    ];

    // exportPersonnelToExcel never includes ssn/driversLicenseNumber (see
    // its own file for why), so a re-import of an exported file cannot
    // carry those forward on its own. This appends the two columns onto
    // the exported sheet before importing, to prove the rest of the
    // exported data survives the round trip once those are supplied.
    const buffer = await exportPersonnelToExcel(original);
    expect(buffer.length).toBeGreaterThan(0);

    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.worksheets[0];
    const ssnCol = sheet.columnCount + 1;
    const licenseCol = sheet.columnCount + 2;
    sheet.getRow(1).getCell(ssnCol).value = "SSN";
    sheet.getRow(1).getCell(licenseCol).value = "Driver's License Number";
    sheet.getRow(2).getCell(ssnCol).value = "123-45-6789";
    sheet.getRow(2).getCell(licenseCol).value = "D1234567";
    const withPii = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await importPersonnelFromExcel(withPii);

    expect(result.errors).toEqual([]);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].employeeId).toBe("000010");
    expect(result.valid[0].firstName).toBe("Jamie");
    expect(result.valid[0].craft).toBe("CARPENTER");
    expect(result.valid[0].classification).toBe("JOURNEYMAN");
    expect(result.valid[0].certifications).toEqual(["OSHA-30"]);
  });

  it("accepts a human-readable craft and classification label, not just the stored code", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Personnel");
    sheet.columns = [
      { header: "Employee ID", key: "employeeId" },
      { header: "First Name", key: "firstName" },
      { header: "Last Name", key: "lastName" },
      { header: "Date of Birth", key: "dateOfBirth" },
      { header: "Hire Date", key: "hireDate" },
      { header: "SSN", key: "ssn" },
      { header: "Driver's License Number", key: "driversLicenseNumber" },
      { header: "Street Address", key: "homeStreet1" },
      { header: "City", key: "homeCity" },
      { header: "State", key: "homeState" },
      { header: "Postal Code", key: "homePostalCode" },
      { header: "Phone Number", key: "phoneNumber" },
      { header: "Craft", key: "craft" },
      { header: "Classification", key: "classification" },
    ];
    sheet.addRow({
      employeeId: "42",
      firstName: "Sam",
      lastName: "Lee",
      dateOfBirth: "1995-01-01",
      hireDate: "2023-06-01",
      ssn: "987-65-4321",
      driversLicenseNumber: "L9988",
      homeStreet1: "1 Elm St",
      homeCity: "Reno",
      homeState: "NV",
      homePostalCode: "89501",
      phoneNumber: "(775) 555-0199",
      craft: "Pipe Fitter", // label, not "PIPE_FITTER"
      classification: "foreman", // lowercase label, not "FOREMAN"
    });
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await importPersonnelFromExcel(buffer);

    expect(result.errors).toEqual([]);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].craft).toBe("PIPE_FITTER");
    expect(result.valid[0].classification).toBe("FOREMAN");
    expect(result.valid[0].employeeId).toBe("000042"); // normalized, like the create form
  });

  it("reports a clear error for a row missing a required field, without blocking other rows", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Personnel");
    sheet.columns = [
      { header: "Employee ID", key: "employeeId" },
      { header: "First Name", key: "firstName" },
      { header: "Last Name", key: "lastName" },
      { header: "Date of Birth", key: "dateOfBirth" },
      { header: "Hire Date", key: "hireDate" },
      { header: "SSN", key: "ssn" },
      { header: "Driver's License Number", key: "driversLicenseNumber" },
      { header: "Street Address", key: "homeStreet1" },
      { header: "City", key: "homeCity" },
      { header: "State", key: "homeState" },
      { header: "Postal Code", key: "homePostalCode" },
      { header: "Phone Number", key: "phoneNumber" },
      { header: "Craft", key: "craft" },
      { header: "Classification", key: "classification" },
    ];
    // Row 1: missing SSN entirely.
    sheet.addRow({
      employeeId: "1",
      firstName: "No",
      lastName: "Ssn",
      dateOfBirth: "1990-01-01",
      hireDate: "2020-01-01",
      driversLicenseNumber: "D1",
      homeStreet1: "1 A St",
      homeCity: "Reno",
      homeState: "NV",
      homePostalCode: "89501",
      phoneNumber: "(775) 555-0100",
      craft: "LABORER",
      classification: "APPRENTICE",
    });
    // Row 2: complete and valid.
    sheet.addRow({
      employeeId: "2",
      firstName: "Has",
      lastName: "Ssn",
      dateOfBirth: "1990-01-01",
      hireDate: "2020-01-01",
      ssn: "111-11-1111",
      driversLicenseNumber: "D2",
      homeStreet1: "2 A St",
      homeCity: "Reno",
      homeState: "NV",
      homePostalCode: "89501",
      phoneNumber: "(775) 555-0100",
      craft: "LABORER",
      classification: "APPRENTICE",
    });
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await importPersonnelFromExcel(buffer);

    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].employeeId).toBe("000002");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(1);
    expect(result.errors[0].message.toLowerCase()).toContain("ssn");
  });
});
