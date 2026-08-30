import JobForm from "../JobForm";
import { createJobAction } from "../actions";

export default function NewJobPage() {
  return (
    <div>
      <h1>New Job</h1>
      <JobForm action={createJobAction} submitLabel="Create Job" />
    </div>
  );
}
