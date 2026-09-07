import { listMaterials } from "@/modules/inventory/repository";
import { exportMaterialsToExcel } from "@/modules/import-export/excel/exportMaterials";
import { requireAuthContext } from "@/modules/shared/currentUser";
import { xlsxDownload, unauthorizedIfSignedOut } from "../../exportResponse";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { orgId } = await requireAuthContext();
    const materials = await listMaterials(orgId);

    const buffer = await exportMaterialsToExcel(
      materials.map((material) => ({
        sku: material.sku,
        name: material.name,
        unit: material.unit,
        quantityOnHand: material.quantityOnHand,
        reorderThreshold: material.reorderThreshold,
      }))
    );

    return xlsxDownload(buffer, "materials");
  } catch (err) {
    return unauthorizedIfSignedOut(err);
  }
}
