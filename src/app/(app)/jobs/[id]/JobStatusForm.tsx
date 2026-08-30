"use client";

import { useActionState } from "react";
import { updateJobStatusAction, cancelJobAction, type ActionState } from "../actions";
import type { JobStatus } from "@/modules/jobs/types";
import styles from "./JobStatusForm.module.css";

interface JobStatusFormProps {
  jobId: string;
  allowedNextStatuses: JobStatus[];
}

export default function JobStatusForm({ jobId, allowedNextStatuses }: JobStatusFormProps) {
  const [statusState, statusFormAction, statusPending] = useActionState(
    updateJobStatusAction.bind(null, jobId),
    {} as ActionState
  );
  const [cancelState, cancelFormAction, cancelPending] = useActionState(
    cancelJobAction.bind(null, jobId),
    {} as ActionState
  );

  if (allowedNextStatuses.length === 0) {
    return null;
  }

  const canCancel = allowedNextStatuses.includes("CANCELLED");

  return (
    <div>
      <form action={statusFormAction} className={styles.row}>
        <select name="status" defaultValue={allowedNextStatuses[0]}>
          {allowedNextStatuses.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button type="submit" disabled={statusPending}>
          {statusPending ? "Updating..." : "Change Status"}
        </button>
      </form>
      {statusState.error && <p className={styles.error}>{statusState.error}</p>}

      {canCancel && (
        <>
          <form action={cancelFormAction} className={styles.row}>
            <button type="submit" className={styles.cancelButton} disabled={cancelPending}>
              {cancelPending ? "Cancelling..." : "Cancel Job"}
            </button>
          </form>
          {cancelState.error && <p className={styles.error}>{cancelState.error}</p>}
        </>
      )}
    </div>
  );
}
