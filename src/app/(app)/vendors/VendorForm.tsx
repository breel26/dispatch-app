"use client";

import { useActionState } from "react";
import type { ActionState } from "./actions";
import styles from "./form.module.css";

interface VendorFormProps {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  initialValues?: {
    name: string;
    email: string;
    phone: string | null;
    categories: string[];
  };
}

export default function VendorForm({ action, submitLabel, initialValues }: VendorFormProps) {
  const [state, formAction, isPending] = useActionState(action, {} as ActionState);

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required defaultValue={initialValues?.name} />
      </div>
      <div className={styles.field}>
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required defaultValue={initialValues?.email} />
      </div>
      <div className={styles.field}>
        <label htmlFor="phone">Phone</label>
        <input id="phone" name="phone" defaultValue={initialValues?.phone ?? ""} />
      </div>
      <div className={styles.field}>
        <label htmlFor="categories">Categories (comma-separated)</label>
        <input
          id="categories"
          name="categories"
          defaultValue={initialValues?.categories.join(", ")}
          placeholder="concrete, equipment rental"
        />
      </div>
      {state.error && <p className={styles.error}>{state.error}</p>}
      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
