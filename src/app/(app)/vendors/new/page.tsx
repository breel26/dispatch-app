import VendorForm from "../VendorForm";
import { createVendorAction } from "../actions";

export default function NewVendorPage() {
  return (
    <div>
      <h1>New Vendor</h1>
      <VendorForm action={createVendorAction} submitLabel="Create Vendor" />
    </div>
  );
}
