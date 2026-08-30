"use client";

import { useActionState } from "react";
import { adjustMaterialQuantityAction } from "../../actions";
import type { ActionState } from "../../actions";
import styles from "../../form.module.css";

export default function AdjustQuantityForm({ materialId }: { materialId: string }) {
  const [state, formAction, isPending] = useActionState(
    adjustMaterialQuantityAction.bind(null, materialId),
    {} as ActionState
  );

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="delta">Adjustment (use a negative number to deduct)</label>
        <input id="delta" name="delta" type="number" step="any" required />
      </div>
      <div className={styles.field}>
        <label htmlFor="reason">Reason</label>
        <input id="reason" name="reason" required placeholder="Delivery received, job consumption, etc." />
      </div>
      {state.error && <p className={styles.error}>{state.error}</p>}
      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Adjusting..." : "Adjust Quantity"}
      </button>
    </form>
  );
}
