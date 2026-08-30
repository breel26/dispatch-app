"use client";

import { useActionState } from "react";
import { findPurchaseOrderAction, type ActionState } from "../actions";
import styles from "./PoLookupForm.module.css";

// On success the action redirects, so this component only ever renders
// the failure case — an invalid format or a number no PO has.
export default function PoLookupForm() {
  const [state, formAction, isPending] = useActionState(
    findPurchaseOrderAction,
    {} as ActionState
  );

  return (
    <div className={styles.lookup}>
      <form action={formAction} className={styles.row}>
        <label htmlFor="poNumber" className={styles.label}>
          Find PO
        </label>
        <input
          id="poNumber"
          name="poNumber"
          type="text"
          placeholder="PO-000047"
          autoComplete="off"
          className={styles.input}
        />
        <button type="submit" disabled={isPending} className={styles.button}>
          {isPending ? "Finding..." : "Go"}
        </button>
      </form>
      {state.error && <p className={styles.error}>{state.error}</p>}
    </div>
  );
}
