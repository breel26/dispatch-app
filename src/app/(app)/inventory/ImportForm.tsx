"use client";

import { useActionState } from "react";
import type { ImportActionState } from "./importActions";
import ImportColumns, { type ImportColumn } from "./ImportColumns";
import ImportSummary from "./ImportSummary";
import styles from "./form.module.css";

interface ImportFormProps {
  action: (prevState: ImportActionState, formData: FormData) => Promise<ImportActionState>;
  // Plain column names as the importer's header map expects them
  // (case-insensitive), shown directly on the page so a spreadsheet can
  // be prepared correctly without needing a separate downloaded template.
  columns: ImportColumn[];
}

// The straightforward importer: every row is written on upload. Used by
// Materials, whose SKU carries no numbering scheme to collide within.
// Equipment and Personnel use ResolvingImportForm instead, because a
// number already in use there is a question rather than an answer.
export default function ImportForm({ action, columns }: ImportFormProps) {
  const [state, formAction, isPending] = useActionState(action, {} as ImportActionState);

  return (
    <div>
      <ImportColumns columns={columns} />

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

      {state.summary && <ImportSummary summary={state.summary} />}
    </div>
  );
}
