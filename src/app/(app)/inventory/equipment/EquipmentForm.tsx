"use client";

import { useActionState } from "react";
import type { ActionState } from "../actions";
import styles from "../form.module.css";

const EQUIPMENT_STATUSES = ["AVAILABLE", "ASSIGNED", "MAINTENANCE", "OUT_OF_SERVICE"] as const;

interface EquipmentFormProps {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  initialValues?: {
    name: string;
    type: string;
    status: string;
    location: string | null;
  };
}

export default function EquipmentForm({ action, submitLabel, initialValues }: EquipmentFormProps) {
  const [state, formAction, isPending] = useActionState(action, {} as ActionState);

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required defaultValue={initialValues?.name} />
      </div>
      <div className={styles.field}>
        <label htmlFor="type">Type</label>
        <input id="type" name="type" required defaultValue={initialValues?.type} />
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
