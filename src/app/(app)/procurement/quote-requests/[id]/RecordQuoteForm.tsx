"use client";

import { useActionState } from "react";
import { createQuoteAction } from "../../actions";
import type { ActionState } from "../../actions";
import styles from "../../form.module.css";

interface ItemOption {
  id: string;
  type: "MATERIAL" | "EQUIPMENT";
  resourceId: string;
  label: string;
}

interface RecordQuoteFormProps {
  quoteRequestId: string;
  vendorId: string;
  items: ItemOption[];
}

export default function RecordQuoteForm({ quoteRequestId, vendorId, items }: RecordQuoteFormProps) {
  const [state, formAction, isPending] = useActionState(
    createQuoteAction.bind(null, quoteRequestId, vendorId),
    {} as ActionState
  );

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="item">Item this quote is for</label>
        <select id="item" name="itemKey" defaultValue="" required>
          <option value="" disabled>
            Select an item
          </option>
          {items.map((item) => (
            <option key={item.id} value={`${item.type}:${item.resourceId}`}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.field}>
        <label htmlFor="price">Price</label>
        <input id="price" name="price" type="number" min="0" step="any" required />
      </div>
      <div className={styles.field}>
        <label htmlFor="leadTimeDays">Lead time (days)</label>
        <input id="leadTimeDays" name="leadTimeDays" type="number" min="0" step="1" />
      </div>
      <div className={styles.field}>
        <label htmlFor="expiresAt">Expires</label>
        <input id="expiresAt" name="expiresAt" type="date" />
      </div>
      {state.error && <p className={styles.error}>{state.error}</p>}
      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Recording..." : "Record Quote"}
      </button>
    </form>
  );
}
