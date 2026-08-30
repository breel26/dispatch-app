"use client";

import { useActionState, useState } from "react";
import { createAssignmentAction } from "./dispatch-actions";
import type { ActionState } from "../actions";
import styles from "./AssignmentForm.module.css";

interface ResourceOption {
  id: string;
  label: string;
}

interface AssignmentFormProps {
  jobId: string;
  personnelOptions: ResourceOption[];
  materialOptions: ResourceOption[];
  equipmentOptions: ResourceOption[];
}

type ResourceType = "PERSONNEL" | "MATERIAL" | "EQUIPMENT";

export default function AssignmentForm({
  jobId,
  personnelOptions,
  materialOptions,
  equipmentOptions,
}: AssignmentFormProps) {
  const [state, formAction, isPending] = useActionState(
    createAssignmentAction.bind(null, jobId),
    {} as ActionState
  );
  const [resourceType, setResourceType] = useState<ResourceType>("PERSONNEL");

  const options =
    resourceType === "PERSONNEL"
      ? personnelOptions
      : resourceType === "MATERIAL"
        ? materialOptions
        : equipmentOptions;

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="resourceType">Type</label>
        <select
          id="resourceType"
          name="resourceType"
          value={resourceType}
          onChange={(e) => setResourceType(e.target.value as ResourceType)}
        >
          <option value="PERSONNEL">Personnel</option>
          <option value="MATERIAL">Material</option>
          <option value="EQUIPMENT">Equipment</option>
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="resourceId">Resource</label>
        <select id="resourceId" name="resourceId" required>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {resourceType !== "PERSONNEL" && (
        <div className={styles.field}>
          <label htmlFor="quantity">Quantity</label>
          <input id="quantity" name="quantity" type="number" min="0" step="any" required />
        </div>
      )}

      <div className={styles.field}>
        <label htmlFor="startAt">Start</label>
        <input id="startAt" name="startAt" type="datetime-local" required />
      </div>

      <div className={styles.field}>
        <label htmlFor="endAt">End</label>
        <input id="endAt" name="endAt" type="datetime-local" />
      </div>

      <div className={styles.field}>
        <label htmlFor="notes">Notes</label>
        <input id="notes" name="notes" />
      </div>

      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Assigning..." : "Add Assignment"}
      </button>

      {state.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
