import { notFound } from "next/navigation";
import { getEquipmentById } from "@/modules/inventory/repository";
import { parseEquipmentNumber } from "@/modules/inventory/equipmentNumber";
import EquipmentForm from "../../EquipmentForm";
import { updateEquipmentAction } from "../../../actions";
import { requireAuthContext } from "@/modules/shared/currentUser";

export const dynamic = "force-dynamic";

interface EditEquipmentPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditEquipmentPage({ params }: EditEquipmentPageProps) {
  const { orgId } = await requireAuthContext();
  const { id } = await params;
  const equipment = await getEquipmentById(orgId, id);
  if (!equipment) notFound();

  // The stored equipmentNumber is one string; the form edits it as three
  // pieces (type, capacity, sequence) so the dropdowns can preselect.
  // parseEquipmentNumber cannot fail here - the stored value only ever got
  // there by passing the same validation the form itself enforces.
  const numberParts = parseEquipmentNumber(equipment.equipmentNumber);

  return (
    <div>
      <h1>Edit Equipment</h1>
      <EquipmentForm
        action={updateEquipmentAction.bind(null, id)}
        submitLabel="Save Changes"
        initialValues={{
          equipmentNumberType: numberParts?.type ?? "",
          equipmentNumberCapacity: numberParts?.capacity ?? "",
          equipmentNumberSequence: numberParts?.sequence ?? "",
          name: equipment.name,
          type: equipment.type,
          make: equipment.make,
          model: equipment.model,
          operatingHours: equipment.operatingHours,
          requiredCertifications: equipment.requiredCertifications,
          status: equipment.status,
          location: equipment.location,
        }}
      />
    </div>
  );
}
