import { notFound } from "next/navigation";
import { getJobById } from "@/modules/jobs/repository";
import JobForm from "../../JobForm";
import { updateJobAction } from "../../actions";
import { requireAuthContext } from "@/modules/shared/currentUser";

export const dynamic = "force-dynamic";

interface EditJobPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditJobPage({ params }: EditJobPageProps) {
  const { orgId } = await requireAuthContext();
  const { id } = await params;
  const job = await getJobById(orgId, id);
  if (!job) notFound();

  return (
    <div>
      <h1>Edit Job</h1>
      <JobForm
        action={updateJobAction.bind(null, id)}
        submitLabel="Save Changes"
        initialValues={job}
      />
    </div>
  );
}
