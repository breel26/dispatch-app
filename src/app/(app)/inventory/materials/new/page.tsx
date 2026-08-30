import MaterialForm from "../MaterialForm";
import { createMaterialAction } from "../../actions";

export default function NewMaterialPage() {
  return (
    <div>
      <h1>New Material</h1>
      <MaterialForm action={createMaterialAction} submitLabel="Create Material" mode="create" />
    </div>
  );
}
