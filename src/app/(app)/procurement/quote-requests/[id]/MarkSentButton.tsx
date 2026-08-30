"use client";

import { useActionState } from "react";
import { markQuoteRequestSentAction } from "../../actions";
import type { ActionState } from "../../actions";

export default function MarkSentButton({ quoteRequestId }: { quoteRequestId: string }) {
  const [state, formAction, isPending] = useActionState(
    markQuoteRequestSentAction.bind(null, quoteRequestId),
    {} as ActionState
  );

  return (
    <form action={formAction}>
      <button type="submit" disabled={isPending}>
        {isPending ? "Marking..." : "Mark Sent"}
      </button>
      {state.error && <p style={{ color: "#c0392b" }}>{state.error}</p>}
    </form>
  );
}
