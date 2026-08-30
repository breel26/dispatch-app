"use client";

import { useActionState } from "react";
import type { ActionState } from "../actions";
import styles from "../form.module.css";

interface PersonnelFormProps {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  initialValues?: {
    name: string;
    role: string;
    certifications: string[];
    isActive: boolean;
  };
}

export default function PersonnelForm({ action, submitLabel, initialValues }: PersonnelFormProps) {
  const [state, formAction, isPending] = useActionState(action, {} as ActionState);

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required defaultValue={initialValues?.name} />
      </div>
      <div className={styles.field}>
        <label htmlFor="role">Role</label>
        <input id="role" name="role" required defaultValue={initialValues?.role} />
      </div>
      <div className={styles.field}>
        <label htmlFor="certifications">Certifications (comma-separated)</label>
        <input
          id="certifications"
          name="certifications"
          defaultValue={initialValues?.certifications.join(", ")}
          placeholder="OSHA-30, Crane Operator"
        />
      </div>
      <div className={styles.checkboxField}>
        <input
          id="isActive"
          name="isActive"
          type="checkbox"
          defaultChecked={initialValues?.isActive ?? true}
        />
        <label htmlFor="isActive">Active</label>
      </div>
      {state.error && <p className={styles.error}>{state.error}</p>}
      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
