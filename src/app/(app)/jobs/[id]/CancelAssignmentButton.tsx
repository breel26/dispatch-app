"use client";

import { useActionState } from "react";
import { cancelAssignmentAction } from "./dispatch-actions";
import type { ActionState } from "../actions";

export default function CancelAssignmentButton({
  jobId,
  assignmentId,
}: {
  jobId: string;
  assignmentId: string;
}) {
  const [state, formAction, isPending] = useActionState(
    cancelAssignmentAction.bind(null, jobId, assignmentId),
    {} as ActionState
  );

  return (
    <form action={formAction}>
      <button type="submit" disabled={isPending}>
        {isPending ? "Cancelling..." : "Cancel"}
      </button>
      {state.error && <span style={{ color: "#c0392b", marginLeft: "0.5rem" }}>{state.error}</span>}
    </form>
  );
}
