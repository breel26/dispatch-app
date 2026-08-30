import { notFound } from "next/navigation";
import { getMaterialById } from "@/modules/inventory/repository";
import MaterialForm from "../../MaterialForm";
import { updateMaterialAction } from "../../../actions";

export const dynamic = "force-dynamic";

interface EditMaterialPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditMaterialPage({ params }: EditMaterialPageProps) {
  const { id } = await params;
  const material = await getMaterialById(id);
  if (!material) notFound();

  return (
    <div>
      <h1>Edit Material</h1>
      <MaterialForm
        action={updateMaterialAction.bind(null, id)}
        submitLabel="Save Changes"
        mode="edit"
        initialValues={material}
      />
    </div>
  );
}
