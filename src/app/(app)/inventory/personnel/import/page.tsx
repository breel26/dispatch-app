import ImportForm from "../../ImportForm";
import { importPersonnelAction } from "../../importActions";

export default function ImportPersonnelPage() {
  return (
    <div>
      <h1>Import Personnel</h1>
      <p>
        A row whose Employee ID already exists on file updates that worker, including their SSN
        and driver license number if the file has them - the file is treated as the current
        source of truth for that row. A new Employee ID creates a new worker.
      </p>
      <p>
        SSN and driver license number are encrypted the moment each row is written and are never
        written to disk in plain form - the uploaded file is only ever held in memory for the
        length of this import.
      </p>
      <ImportForm
        action={importPersonnelAction}
        columns={[
          { name: "Employee ID", required: true, note: "Any number; padded to 6 digits" },
          { name: "First Name", required: true },
          { name: "Middle Name", required: false },
          { name: "Last Name", required: true },
          { name: "Date of Birth", required: true },
          { name: "Hire Date", required: true },
          { name: "SSN", required: true, note: "Format XXX-XX-XXXX" },
          { name: "Driver's License Number", required: true },
          { name: "Street Address", required: true },
          { name: "Street Address 2", required: false },
          { name: "City", required: true },
          { name: "State", required: true, note: "2-letter abbreviation" },
          { name: "Postal Code", required: true },
          { name: "Country", required: false, note: "Defaults to US" },
          { name: "Phone Number", required: true, note: "Format (XXX) XXX-XXXX" },
          {
            name: "Craft",
            required: true,
            note: "Carpenter, Laborer, Ironworker, Operator, Electrician, Pipe Fitter, Plumber, Mason, Pile Driver, or Teamster",
          },
          { name: "Classification", required: true, note: "Apprentice, Journeyman, Foreman, or Superintendent" },
          { name: "Certifications", required: false, note: "Comma-separated" },
          { name: "Active", required: false, note: "true/false, yes/no; defaults to active" },
        ]}
      />
    </div>
  );
}
