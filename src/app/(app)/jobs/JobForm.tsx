"use client";

import { useActionState } from "react";
import type { ActionState } from "./actions";
import styles from "./JobForm.module.css";

interface JobFormProps {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  initialValues?: {
    jobNumber: string;
    name: string;
    siteAddress: string;
    startDate: Date | null;
    endDate: Date | null;
    notes: string | null;
  };
}

function toDateInputValue(date: Date | null): string {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

export default function JobForm({ action, submitLabel, initialValues }: JobFormProps) {
  const [state, formAction, isPending] = useActionState(action, {} as ActionState);

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="jobNumber">Job number</label>
        <input id="jobNumber" name="jobNumber" required defaultValue={initialValues?.jobNumber} />
      </div>
      <div className={styles.field}>
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required defaultValue={initialValues?.name} />
      </div>
      <div className={styles.field}>
        <label htmlFor="siteAddress">Site address</label>
        <input
          id="siteAddress"
          name="siteAddress"
          required
          defaultValue={initialValues?.siteAddress}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="startDate">Start date</label>
        <input
          id="startDate"
          name="startDate"
          type="date"
          defaultValue={toDateInputValue(initialValues?.startDate ?? null)}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="endDate">End date</label>
        <input
          id="endDate"
          name="endDate"
          type="date"
          defaultValue={toDateInputValue(initialValues?.endDate ?? null)}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="notes">Notes</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={initialValues?.notes ?? ""} />
      </div>
      {state.error && <p className={styles.error}>{state.error}</p>}
      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
