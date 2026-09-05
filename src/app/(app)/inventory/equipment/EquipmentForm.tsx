"use client";

import { useActionState } from "react";
import { EQUIPMENT_TYPE_OPTIONS, EQUIPMENT_CAPACITY_OPTIONS } from "@/modules/inventory/equipmentNumber";
import type { ActionState } from "../actions";
import styles from "../form.module.css";

const EQUIPMENT_STATUSES = ["AVAILABLE", "ASSIGNED", "MAINTENANCE", "OUT_OF_SERVICE"] as const;

interface EquipmentFormProps {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  initialValues?: {
    equipmentNumberType: string;
    equipmentNumberCapacity: string;
    equipmentNumberSequence: string;
    name: string;
    type: string;
    make: string;
    model: string;
    operatingHours: number | null;
    requiredCertifications: string[];
    status: string;
    location: string | null;
  };
}

export default function EquipmentForm({ action, submitLabel, initialValues }: EquipmentFormProps) {
  const [state, formAction, isPending] = useActionState(action, {} as ActionState);

  return (
    <form action={formAction} className={styles.form}>
      {/* The fleet number is entered as three pieces rather than one raw
          XX-XX-XXXX string, so a dispatcher picks the type and capacity
          off the registry instead of memorizing what "03" means. The
          Server Action joins them before validation - see
          modules/inventory/equipmentNumber.ts for what each code means. */}
      <div className={styles.field}>
        <label htmlFor="equipmentNumberType">Equipment type code</label>
        <select
          id="equipmentNumberType"
          name="equipmentNumberType"
          required
          defaultValue={initialValues?.equipmentNumberType ?? ""}
        >
          <option value="" disabled>
            Select a type
          </option>
          {EQUIPMENT_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="equipmentNumberCapacity">Weight / capacity class</label>
        <select
          id="equipmentNumberCapacity"
          name="equipmentNumberCapacity"
          required
          defaultValue={initialValues?.equipmentNumberCapacity ?? ""}
        >
          <option value="" disabled>
            Select a capacity class
          </option>
          {EQUIPMENT_CAPACITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="equipmentNumberSequence">Fleet sequence number</label>
        <input
          id="equipmentNumberSequence"
          name="equipmentNumberSequence"
          required
          inputMode="numeric"
          placeholder="0001"
          defaultValue={initialValues?.equipmentNumberSequence}
        />
        <p className={styles.hint}>
          Unique among equipment sharing the same type and capacity class above. Padded to four
          digits, so 7 becomes 0007.
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required defaultValue={initialValues?.name} />
        <p className={styles.hint}>
          Who this piece of equipment is - the company itself, or the rental vendor it came from
          (e.g. &quot;Company Owned&quot;, &quot;Herc&quot;, &quot;Sunbelt&quot;).
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="type">Description</label>
        <input
          id="type"
          name="type"
          required
          placeholder="e.g. 336 Excavator, 32m Concrete Pump"
          defaultValue={initialValues?.type}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="make">Make</label>
        <input id="make" name="make" required defaultValue={initialValues?.make} />
      </div>

      <div className={styles.field}>
        <label htmlFor="model">Model</label>
        <input id="model" name="model" required defaultValue={initialValues?.model} />
      </div>

      <div className={styles.field}>
        <label htmlFor="operatingHours">Operating hours</label>
        <input
          id="operatingHours"
          name="operatingHours"
          type="number"
          min="0"
          step="any"
          defaultValue={initialValues?.operatingHours ?? undefined}
          placeholder={initialValues ? "Not recorded" : "0"}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="requiredCertifications">Required certifications (comma-separated)</label>
        <input
          id="requiredCertifications"
          name="requiredCertifications"
          defaultValue={initialValues?.requiredCertifications.join(", ")}
          placeholder="Crane Operator, OSHA-30"
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={initialValues?.status ?? "AVAILABLE"}>
          {EQUIPMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="location">Location</label>
        <input id="location" name="location" defaultValue={initialValues?.location ?? ""} />
      </div>

      {state.error && <p className={styles.error}>{state.error}</p>}
      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
