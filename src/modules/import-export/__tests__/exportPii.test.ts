import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { exportPersonnelToExcel } from "../excel/exportPersonnel";

/**
 * The personnel export is now reachable from the UI (GET
 * /inventory/personnel/export), so a file of the whole roster can leave
 * the server on any dispatcher's click. The rule from CLAUDE.md is that
 * neither the SSN nor the driver licence number is ever rendered, passed
 * to a Client Component, or written into an export.
 *
 * The route enforces this at compile time by mapping field by field into
 * PersonnelExportRow, which has no slot for either. This asserts the other
 * half - that the exporter itself does not reintroduce them - by reading
 * the bytes it actually produces rather than trusting the column list.
 */
describe("personnel export carries no PII", () => {
  const person = {
    employeeId: "000010",
    firstName: "Jamie",
    middleName: null,
    lastName: "Rivera",
    dateOfBirth: new Date("1990-04-02"),
    hireDate: new Date("2021-06-14"),
    homeStreet1: "128 Alder St",
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
  };

  async function readSheet() {
    const buffer = await exportPersonnelToExcel([person]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    return { sheet: workbook.worksheets[0], buffer };
  }

  it("has no column that could hold an SSN or a licence number", async () => {
    const { sheet } = await readSheet();
    const headers = (sheet.getRow(1).values as unknown[])
      .filter((h): h is string => typeof h === "string")
      .map((h) => h.toLowerCase());

    expect(headers.length).toBeGreaterThan(0);
    for (const header of headers) {
      expect(header).not.toContain("ssn");
      expect(header).not.toContain("social");
      expect(header).not.toContain("licen");
    }
  });

  it("writes only the fields the export declares", async () => {
    const { sheet } = await readSheet();
    const headers = (sheet.getRow(1).values as unknown[]).filter(
      (h): h is string => typeof h === "string"
    );

    // Pinned deliberately. A new column appearing here should be a
    // decision someone made on purpose, not something that arrived with a
    // schema change.
    expect(headers).toEqual([
      "Employee ID",
      "First Name",
      "Middle Name",
      "Last Name",
      "Date of Birth",
      "Hire Date",
      "Street Address",
      "Street Address 2",
      "City",
      "State",
      "Postal Code",
      "Country",
      "Phone Number",
      "Craft",
      "Classification",
      "Certifications",
      "Active",
    ]);
  });
});
