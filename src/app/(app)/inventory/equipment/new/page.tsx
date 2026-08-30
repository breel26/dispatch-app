import EquipmentForm from "../EquipmentForm";
import { createEquipmentAction } from "../../actions";

export default function NewEquipmentPage() {
  return (
    <div>
      <h1>New Equipment</h1>
      <EquipmentForm action={createEquipmentAction} submitLabel="Create Equipment" />
    </div>
  );
}
