"use client";

import { useActionState } from "react";
import type { ImportActionState } from "./importActions";
import styles from "./form.module.css";

interface ImportFormProps {
  action: (prevState: ImportActionState, formData: FormData) => Promise<ImportActionState>;
  // Plain column names as the importer's header map expects them
  // (case-insensitive), shown directly on the page so a spreadsheet can
  // be prepared correctly without needing a separate downloaded template.
  columns: { name: string; required: boolean; note?: string }[];
}

export default function ImportForm({ action, columns }: ImportFormProps) {
  const [state, formAction, isPending] = useActionState(action, {} as ImportActionState);

  return (
    <div>
      <div className={styles.section}>
        <h2>Expected columns</h2>
        <p className={styles.hint}>
          The first row must be a header row with these column names (not case-sensitive).
          Columns not listed here are ignored.
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Column</th>
              <th style={{ textAlign: "left" }}>Required</th>
              <th style={{ textAlign: "left" }}>Notes</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((col) => (
              <tr key={col.name}>
                <td>{col.name}</td>
                <td>{col.required ? "Yes" : "No"}</td>
                <td>{col.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form action={formAction} className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="file">Excel file (.xlsx)</label>
          <input id="file" name="file" type="file" accept=".xlsx" required />
        </div>

        {state.error && <p className={styles.error}>{state.error}</p>}

        <button type="submit" className={styles.submit} disabled={isPending}>
          {isPending ? "Importing..." : "Import"}
        </button>
      </form>

      {state.summary && (
        <div className={styles.section}>
          <h2>Result</h2>
          <p>
            {state.summary.createdCount} created, {state.summary.updatedCount} updated
            {state.summary.errors.length > 0 && `, ${state.summary.errors.length} row(s) skipped`}
            .
          </p>
          {state.summary.errors.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "0.5rem" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Row</th>
                  <th style={{ textAlign: "left" }}>Problem</th>
                </tr>
              </thead>
              <tbody>
                {state.summary.errors.map((e, i) => (
                  <tr key={i}>
                    <td>{e.row}</td>
                    <td>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
