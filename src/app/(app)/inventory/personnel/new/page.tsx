import PersonnelForm from "../PersonnelForm";
import { createPersonnelAction } from "../../actions";

export default function NewPersonnelPage() {
  return (
    <div>
      <h1>New Personnel</h1>
      <PersonnelForm action={createPersonnelAction} submitLabel="Create Personnel" />
    </div>
  );
}
