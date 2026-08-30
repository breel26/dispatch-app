import { notFound } from "next/navigation";
import { getPersonnelById } from "@/modules/inventory/repository";
import PersonnelForm from "../../PersonnelForm";
import { updatePersonnelAction } from "../../../actions";

export const dynamic = "force-dynamic";

interface EditPersonnelPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPersonnelPage({ params }: EditPersonnelPageProps) {
  const { id } = await params;
  const personnel = await getPersonnelById(id);
  if (!personnel) notFound();

  return (
    <div>
      <h1>Edit Personnel</h1>
      <PersonnelForm
        action={updatePersonnelAction.bind(null, id)}
        submitLabel="Save Changes"
        initialValues={personnel}
      />
    </div>
  );
}
