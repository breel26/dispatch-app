"use client";

import { useActionState, useState, startTransition } from "react";
import type { ImportActionState, ImportReview } from "./importActions";
import ImportColumns, { type ImportColumn } from "./ImportColumns";
import ImportSummary from "./ImportSummary";
import formStyles from "./form.module.css";
import styles from "./importReview.module.css";

interface ResolvingImportFormProps {
  action: (prevState: ImportActionState, formData: FormData) => Promise<ImportActionState>;
  columns: ImportColumn[];
  /** What the natural key is called in this importer, e.g. "equipment number". */
  keyLabel: string;
  /** Format hint shown on the manual-entry box. */
  keyPlaceholder: string;
}

/** One row's pending answer. `action: null` means the dispatcher has not chosen yet. */
interface RowChoice {
  action: "update" | "create" | null;
  /** The number to use when creating. Prefilled with the suggestion. */
  key: string;
}

function defaultChoices(review: ImportReview): Record<number, RowChoice> {
  const choices: Record<number, RowChoice> = {};
  for (const clash of review.clashes) {
    choices[clash.row] = {
      // Rows that look like the record already on file are almost always a
      // re-import of a corrected export, so they start on "update" - that
      // was the old behavior, and preselecting it keeps a 200-row
      // re-import to one click. Rows that look like a different machine or
      // worker start unanswered, which forces a deliberate choice on
      // exactly the rows this feature exists to catch.
      action: clash.likelyDifferent ? null : "update",
      key: clash.suggestion ?? "",
    };
  }
  return choices;
}

/**
 * Import form for the two entities whose rows are keyed by a number the
 * dispatcher assigns (equipment number, employee id), where a number that
 * is already taken is ambiguous rather than simply wrong.
 *
 * Upload runs an analysis pass that writes nothing. If every number is
 * free the rows are committed in the same round trip, so a clean file
 * still imports in one click. Otherwise the clashes come back for review
 * and the same file is submitted again with a decision per row.
 *
 * The file is held in React state and the payload is built by hand rather
 * than letting the browser serialize the form, because React 19 resets an
 * uncontrolled form once its action resolves - which would empty the file
 * input between the review and the commit, exactly when it is needed.
 */
export default function ResolvingImportForm({
  action,
  columns,
  keyLabel,
  keyPlaceholder,
}: ResolvingImportFormProps) {
  const [state, formAction, isPending] = useActionState(action, {} as ImportActionState);
  const [file, setFile] = useState<File | null>(null);
  const [choices, setChoices] = useState<Record<number, RowChoice>>({});
  const [reviewedHash, setReviewedHash] = useState<string | null>(null);

  const review = state.review ?? null;

  // Seed the answers when a new review arrives. Adjusting state during
  // render like this is the supported way to reset state derived from a
  // changing input; the alternative effect would render one frame with
  // last file's answers attached to this file's rows.
  if (review && review.fileHash !== reviewedHash) {
    setReviewedHash(review.fileHash);
    setChoices(defaultChoices(review));
  }

  const unanswered = review
    ? review.clashes.filter((clash) => {
        const choice = choices[clash.row];
        if (!choice || choice.action === null) return true;
        return choice.action === "create" && choice.key.trim() === "";
      }).length
    : 0;

  function setChoice(row: number, patch: Partial<RowChoice>) {
    setChoices((prev) => ({
      ...prev,
      [row]: { action: prev[row]?.action ?? null, key: prev[row]?.key ?? "", ...patch },
    }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;

    const payload = new FormData();
    payload.set("file", file);

    if (review) {
      payload.set("fileHash", review.fileHash);
      const decisions: Record<string, { action: "update" } | { action: "create"; key: string }> = {};
      for (const clash of review.clashes) {
        const choice = choices[clash.row];
        if (!choice || choice.action === null) continue;
        decisions[String(clash.row)] =
          choice.action === "update"
            ? { action: "update" }
            : { action: "create", key: choice.key.trim() };
      }
      payload.set("decisions", JSON.stringify(decisions));
    }

    startTransition(() => formAction(payload));
  }

  return (
    <div>
      <ImportColumns columns={columns} />

      <form onSubmit={handleSubmit} className={styles.form}>
        <div className={styles.fileField}>
          <label htmlFor="file">Excel file (.xlsx)</label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".xlsx"
            required
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              // A different file makes the outstanding review meaningless.
              // Clearing the marker means the next review reseeds even if
              // the new file happens to produce the same clashing rows.
              setReviewedHash(null);
              setChoices({});
            }}
          />
        </div>

        {state.error && <p className={formStyles.error}>{state.error}</p>}

        {review && (
          <div className={formStyles.section}>
            <h2>Numbers already in use</h2>
            <p className={formStyles.hint}>
              Nothing has been imported yet. {review.clashes.length} row
              {review.clashes.length === 1 ? "" : "s"} reuse a {keyLabel} that is already taken
              {review.cleanCount > 0 && `, and ${review.cleanCount} import without a conflict`}.
              Highlighted rows do not look like the record already on file, so they need an
              answer before this can be imported.
            </p>

            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Number</th>
                  <th>Already used by</th>
                  <th>This row</th>
                  <th>What to do</th>
                </tr>
              </thead>
              <tbody>
                {review.clashes.map((clash) => {
                  const choice = choices[clash.row];
                  return (
                    <tr key={clash.row} className={clash.likelyDifferent ? styles.suspect : undefined}>
                      <td>{clash.row}</td>
                      <td className={styles.number}>
                        {clash.key}
                        {clash.source === "file" && (
                          <div className={styles.badge}>twice in this file</div>
                        )}
                      </td>
                      <td>{clash.heldBy}</td>
                      <td>
                        {clash.incoming}
                        {clash.likelyDifferent && clash.source === "database" && (
                          <div className={styles.badge}>does not match</div>
                        )}
                      </td>
                      <td>
                        <div className={styles.choice}>
                          <label>
                            <input
                              type="radio"
                              name={`choice-${clash.row}`}
                              checked={choice?.action === "update"}
                              onChange={() => setChoice(clash.row, { action: "update" })}
                            />
                            {clash.source === "file"
                              ? `Overwrite what ${clash.heldBy} imported`
                              : "Update the existing record"}
                          </label>
                          <label>
                            <input
                              type="radio"
                              name={`choice-${clash.row}`}
                              checked={choice?.action === "create"}
                              onChange={() => setChoice(clash.row, { action: "create" })}
                            />
                            Create new as
                            <input
                              type="text"
                              value={choice?.key ?? ""}
                              placeholder={keyPlaceholder}
                              disabled={choice?.action !== "create"}
                              aria-label={`New ${keyLabel} for row ${clash.row}`}
                              onChange={(event) =>
                                setChoice(clash.row, { action: "create", key: event.target.value })
                              }
                            />
                          </label>
                          {clash.suggestion === null && (
                            <span className={styles.exhausted}>
                              No free {keyLabel} left to suggest here - enter one.
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {unanswered > 0 && (
              <p className={styles.pending}>
                {unanswered} row{unanswered === 1 ? "" : "s"} still need an answer.
              </p>
            )}
          </div>
        )}

        <button
          type="submit"
          className={formStyles.submit}
          disabled={isPending || !file || unanswered > 0}
        >
          {isPending ? "Working..." : review ? "Import with these choices" : "Import"}
        </button>
      </form>

      {state.summary && <ImportSummary summary={state.summary} />}
    </div>
  );
}
