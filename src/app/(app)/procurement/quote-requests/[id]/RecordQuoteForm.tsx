"use client";

import { useActionState } from "react";
import { createQuoteAction } from "../../actions";
import type { ActionState } from "../../actions";
import styles from "../../form.module.css";

export interface QuotedItemRow {
  itemKey: string; // "MATERIAL:<id>" / "EQUIPMENT:<id>"
  label: string;
  quantity: number;
  unit: string;
}

interface RecordQuoteFormProps {
  quoteRequestId: string;
  vendorId: string;
  items: QuotedItemRow[];
}

// One priced row per requested item, instead of the single price this form
// used to take. The old version had to ask "which item is this price for?"
// because a Quote could only hold one — that was a modelling limitation
// leaking into the UI, and the model no longer has it.
//
// Leaving a price blank means the vendor did not quote that line, which is
// a normal outcome and different from a price of zero. Blank rows are
// skipped rather than sent as 0.
export default function RecordQuoteForm({ quoteRequestId, vendorId, items }: RecordQuoteFormProps) {
  const [state, formAction, isPending] = useActionState(
    createQuoteAction.bind(null, quoteRequestId, vendorId),
    {} as ActionState
  );

  return (
    <form action={formAction} className={styles.form}>
      <p className={styles.hint}>
        Enter the vendor&apos;s unit price for each item they quoted. Leave a price blank
        if they did not quote that item.
      </p>

      <table className={styles.dataTable} style={{ marginBottom: "1rem" }}>
        <thead>
          <tr>
            <th>Item</th>
            <th>Qty</th>
            <th>Unit price</th>
            <th>Lead time (days)</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.itemKey}>
              <td>
                <label htmlFor={`unitPrice_${item.itemKey}`}>{item.label}</label>
              </td>
              <td>
                {item.quantity} {item.unit}
                {/* The quantity is echoed back so the recorded line matches
                    the line that was requested, rather than being re-typed. */}
                <input
                  type="hidden"
                  name={`quantity_${item.itemKey}`}
                  value={item.quantity}
                />
              </td>
              <td>
                <input
                  id={`unitPrice_${item.itemKey}`}
                  name={`unitPrice_${item.itemKey}`}
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </td>
              <td>
                <input
                  name={`leadTimeDays_${item.itemKey}`}
                  type="number"
                  min="0"
                  step="1"
                  placeholder="—"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.field}>
        <label htmlFor="leadTimeDays">Default lead time (days)</label>
        <input id="leadTimeDays" name="leadTimeDays" type="number" min="0" step="1" />
      </div>
      <div className={styles.field}>
        <label htmlFor="expiresAt">Quote expires</label>
        <input id="expiresAt" name="expiresAt" type="date" />
      </div>
      <div className={styles.field}>
        <label htmlFor="notes">Notes</label>
        <input id="notes" name="notes" type="text" />
      </div>

      {state.error && <p className={styles.error}>{state.error}</p>}
      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Recording..." : "Record Quote"}
      </button>
    </form>
  );
}
