"use client";

import { useActionState } from "react";
import { deactivatePersonnelAction, type ActionState } from "../../actions";

export default function DeactivateButton({ personnelId }: { personnelId: string }) {
  const [state, formAction, isPending] = useActionState(
    deactivatePersonnelAction.bind(null, personnelId),
    {} as ActionState
  );

  return (
    <form action={formAction}>
      <button type="submit" disabled={isPending}>
        {isPending ? "Deactivating..." : "Deactivate"}
      </button>
      {state.error && <p style={{ color: "#c0392b" }}>{state.error}</p>}
    </form>
  );
}
