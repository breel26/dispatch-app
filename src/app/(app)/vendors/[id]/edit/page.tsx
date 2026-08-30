import { notFound } from "next/navigation";
import { getVendorById } from "@/modules/vendors/repository";
import VendorForm from "../../VendorForm";
import { updateVendorAction } from "../../actions";
import { requireAuthContext } from "@/modules/shared/currentUser";

export const dynamic = "force-dynamic";

interface EditVendorPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditVendorPage({ params }: EditVendorPageProps) {
  const { orgId } = await requireAuthContext();
  const { id } = await params;
  const vendor = await getVendorById(orgId, id);
  if (!vendor) notFound();

  return (
    <div>
      <h1>Edit Vendor</h1>
      <VendorForm action={updateVendorAction.bind(null, id)} submitLabel="Save Changes" initialValues={vendor} />
    </div>
  );
}
