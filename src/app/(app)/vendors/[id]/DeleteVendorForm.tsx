"use client";

import { useActionState } from "react";
import { deleteVendorAction, type ActionState } from "../actions";
import styles from "./detail.module.css";

export default function DeleteVendorForm({ vendorId }: { vendorId: string }) {
  const [state, formAction, isPending] = useActionState(
    deleteVendorAction.bind(null, vendorId),
    {} as ActionState
  );

  return (
    <form action={formAction}>
      <button type="submit" className={styles.deleteButton} disabled={isPending}>
        {isPending ? "Deleting..." : "Delete Vendor"}
      </button>
      {state.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
