import ImportForm from "../../ImportForm";
import { importEquipmentAction } from "../../importActions";
import { EQUIPMENT_TYPE_CODES, EQUIPMENT_CAPACITY_CODES } from "@/modules/inventory/equipmentNumber";

export default function ImportEquipmentPage() {
  return (
    <div>
      <h1>Import Equipment</h1>
      <p>
        A row whose Equipment Number already exists on file updates that piece of equipment. A
        new Equipment Number creates a new one.
      </p>

      <div style={{ display: "flex", gap: "2rem", marginBottom: "1.5rem" }}>
        <div>
          <h3>Equipment type codes</h3>
          <ul>
            {Object.entries(EQUIPMENT_TYPE_CODES).map(([code, label]) => (
              <li key={code}>
                {code} - {label}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Capacity codes</h3>
          <ul>
            {Object.entries(EQUIPMENT_CAPACITY_CODES).map(([code, label]) => (
              <li key={code}>
                {code} - {label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <ImportForm
        action={importEquipmentAction}
        columns={[
          { name: "Equipment Number", required: true, note: "Format XX-XX-XXXX; see codes above" },
          { name: "Name", required: true, note: "e.g. Company Owned, or a rental vendor" },
          { name: "Type", required: true, note: "Free-text description, e.g. 336 Excavator" },
          { name: "Make", required: true },
          { name: "Model", required: true },
          { name: "Operating Hours", required: false, note: "Defaults to 0 for new equipment" },
          { name: "Required Certifications", required: false, note: "Comma-separated" },
          { name: "Status", required: false, note: "AVAILABLE, ASSIGNED, MAINTENANCE, or OUT_OF_SERVICE" },
          { name: "Location", required: false },
        ]}
      />
    </div>
  );
}
