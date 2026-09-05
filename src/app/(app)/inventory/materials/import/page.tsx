import ImportForm from "../../ImportForm";
import { importMaterialsAction } from "../../importActions";

export default function ImportMaterialsPage() {
  return (
    <div>
      <h1>Import Materials</h1>
      <p>
        A row whose SKU already exists updates that material; quantity on hand is reconciled
        through the stock ledger rather than overwritten, so the change is recorded with a
        reason. A new SKU creates a new material.
      </p>
      <ImportForm
        action={importMaterialsAction}
        columns={[
          { name: "SKU", required: true },
          { name: "Name", required: true },
          { name: "Unit", required: true, note: "e.g. cubic yard, bag, linear ft" },
          { name: "Quantity On Hand", required: true },
          { name: "Reorder Threshold", required: false },
        ]}
      />
    </div>
  );
}
