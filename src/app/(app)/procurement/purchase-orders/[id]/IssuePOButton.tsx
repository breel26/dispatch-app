"use client";

import { useActionState } from "react";
import { issuePurchaseOrderAction } from "../../actions";
import type { ActionState } from "../../actions";

export default function IssuePOButton({ purchaseOrderId }: { purchaseOrderId: string }) {
  const [state, formAction, isPending] = useActionState(
    issuePurchaseOrderAction.bind(null, purchaseOrderId),
    {} as ActionState
  );

  return (
    <form action={formAction}>
      <button type="submit" disabled={isPending}>
        {isPending ? "Issuing..." : "Issue PO"}
      </button>
      {state.error && <p style={{ color: "#c0392b" }}>{state.error}</p>}
    </form>
  );
}
