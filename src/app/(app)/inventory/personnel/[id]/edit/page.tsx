import { notFound } from "next/navigation";
import { getPersonnelById } from "@/modules/inventory/repository";
import PersonnelForm from "../../PersonnelForm";
import { updatePersonnelAction } from "../../../actions";
import { requireAuthContext } from "@/modules/shared/currentUser";

export const dynamic = "force-dynamic";

interface EditPersonnelPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPersonnelPage({ params }: EditPersonnelPageProps) {
  const { orgId } = await requireAuthContext();
  const { id } = await params;
  const personnel = await getPersonnelById(orgId, id);
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
