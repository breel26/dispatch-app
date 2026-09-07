import { describe, it, expect } from "vitest";
import { exportEquipmentToExcel } from "../excel/exportEquipment";
import { importEquipmentFromExcel } from "../excel/importEquipment";

describe("equipment excel round-trip", () => {
  it("exports equipment to xlsx and imports it back with the same data", async () => {
    const original = [
      {
        equipmentNumber: "03-10-0099",
        name: "Company Owned",
        type: "336 Excavator",
        make: "Caterpillar",
        model: "336",
        operatingHours: 1250,
        requiredCertifications: ["Heavy Equipment Operator"],
        status: "AVAILABLE",
        location: "Yard 3",
      },
      {
        equipmentNumber: "12-02-0007",
        name: "Sunbelt",
        type: "Scissor Lift",
        make: "Genie",
        model: "GS-3246",
        operatingHours: null,
        requiredCertifications: [],
        status: "MAINTENANCE",
        location: null,
      },
    ];

    const buffer = await exportEquipmentToExcel(original);
    expect(buffer.length).toBeGreaterThan(0);

    const result = await importEquipmentFromExcel(buffer);

    expect(result.errors).toEqual([]);
    expect(result.valid).toHaveLength(2);
    expect(result.valid[0].data.equipmentNumber).toBe("03-10-0099");
    expect(result.valid[0].data.operatingHours).toBe(1250);
    expect(result.valid[0].data.requiredCertifications).toEqual(["Heavy Equipment Operator"]);
    // A blank Operating Hours cell (the second row) falls back to the
    // schema's own default of 0 for newly created equipment, the same
    // as leaving the field blank on the create form would.
    expect(result.valid[1].data.operatingHours).toBe(0);
    expect(result.valid[1].data.requiredCertifications).toEqual([]);
  });

  it("tolerates a fleet number typed without dashes", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Equipment");
    sheet.columns = [
      { header: "Equipment Number", key: "equipmentNumber" },
      { header: "Name", key: "name" },
      { header: "Type", key: "type" },
      { header: "Make", key: "make" },
      { header: "Model", key: "model" },
    ];
    sheet.addRow({
      equipmentNumber: "03100099",
      name: "Company Owned",
      type: "Excavator",
      make: "Caterpillar",
      model: "336",
    });
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await importEquipmentFromExcel(buffer);

    expect(result.errors).toEqual([]);
    expect(result.valid[0].data.equipmentNumber).toBe("03-10-0099");
  });

  it("reports a clear error for an equipment number naming an unregistered code", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Equipment");
    sheet.columns = [
      { header: "Equipment Number", key: "equipmentNumber" },
      { header: "Name", key: "name" },
      { header: "Type", key: "type" },
      { header: "Make", key: "make" },
      { header: "Model", key: "model" },
    ];
    sheet.addRow({
      equipmentNumber: "99-99-0001",
      name: "Company Owned",
      type: "Mystery Machine",
      make: "Unknown",
      model: "Unknown",
    });
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    const result = await importEquipmentFromExcel(buffer);

    expect(result.valid).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message.toLowerCase()).toContain("equipment number");
  });
});
