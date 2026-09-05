import ExcelJS from "exceljs";

export interface EquipmentExportRow {
  equipmentNumber: string;
  name: string;
  type: string;
  make: string;
  model: string;
  operatingHours: number | null;
  requiredCertifications: string[];
  status: string;
  location: string | null;
}

export async function exportEquipmentToExcel(rows: EquipmentExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Equipment");

  sheet.columns = [
    { header: "Equipment Number", key: "equipmentNumber", width: 18 },
    { header: "Name", key: "name", width: 20 },
    { header: "Type", key: "type", width: 26 },
    { header: "Make", key: "make", width: 16 },
    { header: "Model", key: "model", width: 16 },
    { header: "Operating Hours", key: "operatingHours", width: 16 },
    { header: "Required Certifications", key: "requiredCertifications", width: 30 },
    { header: "Status", key: "status", width: 14 },
    { header: "Location", key: "location", width: 16 },
  ];

  for (const row of rows) {
    sheet.addRow({ ...row, requiredCertifications: row.requiredCertifications.join(", ") });
  }

  sheet.getRow(1).font = { bold: true };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
