import { listEquipment } from "@/modules/inventory/repository";
import { exportEquipmentToExcel } from "@/modules/import-export/excel/exportEquipment";
import { requireAuthContext } from "@/modules/shared/currentUser";
import { xlsxDownload, unauthorizedIfSignedOut } from "../../exportResponse";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { orgId } = await requireAuthContext();

    // No status filter: an export is the whole fleet, including equipment
    // that is out of service. Round-tripping it back through the importer
    // should not quietly drop the machines in the shop.
    const equipment = await listEquipment(orgId);

    const buffer = await exportEquipmentToExcel(
      equipment.map((item) => ({
        equipmentNumber: item.equipmentNumber,
        name: item.name,
        type: item.type,
        make: item.make,
        model: item.model,
        operatingHours: item.operatingHours,
        requiredCertifications: item.requiredCertifications,
        status: item.status,
        location: item.location,
      }))
    );

    return xlsxDownload(buffer, "equipment");
  } catch (err) {
    return unauthorizedIfSignedOut(err);
  }
}
