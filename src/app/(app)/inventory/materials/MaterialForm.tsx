"use client";

import { useActionState } from "react";
import type { ActionState } from "../actions";
import styles from "../form.module.css";

interface MaterialFormProps {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  mode: "create" | "edit";
  initialValues?: {
    sku: string;
    name: string;
    unit: string;
    quantityOnHand: number;
    reorderThreshold: number | null;
  };
}

export default function MaterialForm({ action, submitLabel, mode, initialValues }: MaterialFormProps) {
  const [state, formAction, isPending] = useActionState(action, {} as ActionState);

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="sku">SKU</label>
        <input
          id="sku"
          name="sku"
          required
          defaultValue={initialValues?.sku}
          disabled={mode === "edit"}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required defaultValue={initialValues?.name} />
      </div>
      <div className={styles.field}>
        <label htmlFor="unit">Unit</label>
        <input id="unit" name="unit" required defaultValue={initialValues?.unit} />
      </div>
      {mode === "create" && (
        <div className={styles.field}>
          <label htmlFor="quantityOnHand">Initial quantity on hand</label>
          <input id="quantityOnHand" name="quantityOnHand" type="number" min="0" step="any" />
        </div>
      )}
      <div className={styles.field}>
        <label htmlFor="reorderThreshold">Reorder threshold</label>
        <input
          id="reorderThreshold"
          name="reorderThreshold"
          type="number"
          min="0"
          step="any"
          defaultValue={initialValues?.reorderThreshold ?? undefined}
        />
      </div>
      {state.error && <p className={styles.error}>{state.error}</p>}
      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
