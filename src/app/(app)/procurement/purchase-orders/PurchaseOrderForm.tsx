"use client";

import { useActionState, useState } from "react";
import { createPurchaseOrderAction } from "../actions";
import type { ActionState } from "../actions";
import styles from "../form.module.css";

interface Option {
  id: string;
  label: string;
}

interface LineItemRow {
  key: number;
  type: "MATERIAL" | "EQUIPMENT";
  resourceId: string;
  quantity: string;
  unitPrice: string;
}

interface PurchaseOrderFormProps {
  jobs: Option[];
  vendors: Option[];
  materials: Option[];
  equipment: Option[];
  defaultJobId?: string;
  defaultVendorId?: string;
  defaultQuoteId?: string;
}

let nextKey = 0;

export default function PurchaseOrderForm({
  jobs,
  vendors,
  materials,
  equipment,
  defaultJobId,
  defaultVendorId,
  defaultQuoteId,
}: PurchaseOrderFormProps) {
  const [state, formAction, isPending] = useActionState(createPurchaseOrderAction, {} as ActionState);
  const [rows, setRows] = useState<LineItemRow[]>([
    { key: nextKey++, type: "MATERIAL", resourceId: "", quantity: "", unitPrice: "" },
  ]);

  function updateRow(key: number, patch: Partial<LineItemRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="jobId">Job</label>
        <select id="jobId" name="jobId" required defaultValue={defaultJobId}>
          <option value="" disabled>
            Select a job
          </option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="vendorId">Vendor</label>
        <select id="vendorId" name="vendorId" required defaultValue={defaultVendorId}>
          <option value="" disabled>
            Select a vendor
          </option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      {defaultQuoteId && <input type="hidden" name="quoteId" value={defaultQuoteId} />}

      <h3>Line Items</h3>
      {rows.map((row) => {
        const options = row.type === "MATERIAL" ? materials : equipment;
        return (
          <div key={row.key} className={styles.row}>
            <div className={styles.field}>
              <label>Type</label>
              <select
                name={`lineType_${row.key}`}
                value={row.type}
                onChange={(e) =>
                  updateRow(row.key, { type: e.target.value as LineItemRow["type"], resourceId: "" })
                }
              >
                <option value="MATERIAL">Material</option>
                <option value="EQUIPMENT">Equipment</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>Item</label>
              <select
                name={`lineResourceId_${row.key}`}
                value={row.resourceId}
                onChange={(e) => updateRow(row.key, { resourceId: e.target.value })}
                required
              >
                <option value="" disabled>
                  Select
                </option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label>Quantity</label>
              <input
                name={`lineQuantity_${row.key}`}
                type="number"
                min="0"
                step="any"
                value={row.quantity}
                onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
                required
              />
            </div>
            <div className={styles.field}>
              <label>Unit price</label>
              <input
                name={`lineUnitPrice_${row.key}`}
                type="number"
                min="0"
                step="any"
                value={row.unitPrice}
                onChange={(e) => updateRow(row.key, { unitPrice: e.target.value })}
                required
              />
            </div>
            {rows.length > 1 && (
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
              >
                Remove
              </button>
            )}
          </div>
        );
      })}

      <button
        type="button"
        className={styles.addButton}
        onClick={() =>
          setRows((prev) => [
            ...prev,
            { key: nextKey++, type: "MATERIAL", resourceId: "", quantity: "", unitPrice: "" },
          ])
        }
      >
        Add Line Item
      </button>

      {state.error && <p className={styles.error}>{state.error}</p>}
      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Creating..." : "Create Purchase Order"}
      </button>
    </form>
  );
}
