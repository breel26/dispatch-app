import { notFound } from "next/navigation";
import { getEquipmentById } from "@/modules/inventory/repository";
import EquipmentForm from "../../EquipmentForm";
import { updateEquipmentAction } from "../../../actions";

export const dynamic = "force-dynamic";

interface EditEquipmentPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditEquipmentPage({ params }: EditEquipmentPageProps) {
  const { id } = await params;
  const equipment = await getEquipmentById(id);
  if (!equipment) notFound();

  return (
    <div>
      <h1>Edit Equipment</h1>
      <EquipmentForm
        action={updateEquipmentAction.bind(null, id)}
        submitLabel="Save Changes"
        initialValues={equipment}
      />
    </div>
  );
}
