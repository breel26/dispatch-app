"use client";

import { useActionState } from "react";
import { CRAFT_OPTIONS, CLASSIFICATION_OPTIONS } from "@/modules/inventory/craft";
import type { Craft, Classification } from "@/modules/inventory/craft";
import type { ActionState } from "../actions";
import styles from "../form.module.css";

interface PersonnelFormProps {
  action: (prevState: ActionState, formData: FormData) => Promise<ActionState>;
  submitLabel: string;
  initialValues?: {
    employeeId: string;
    name: string;
    craft: Craft;
    classification: Classification;
    certifications: string[];
    isActive: boolean;
  };
}

export default function PersonnelForm({ action, submitLabel, initialValues }: PersonnelFormProps) {
  const [state, formAction, isPending] = useActionState(action, {} as ActionState);

  return (
    <form action={formAction} className={styles.form}>
      {/* Typed as a plain number and padded on save, so a dispatcher can
          enter "7" without counting zeros. inputMode="numeric" brings up
          the number pad on a phone without a spinner rejecting the leading
          zeros of an id pasted in full. */}
      <div className={styles.field}>
        <label htmlFor="employeeId">Employee ID</label>
        <input
          id="employeeId"
          name="employeeId"
          required
          inputMode="numeric"
          placeholder="000001"
          defaultValue={initialValues?.employeeId}
        />
        <p className={styles.hint}>
          Numbers only. Saved padded to at least six digits, so 7 becomes 000007.
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="name">Name</label>
        <input id="name" name="name" required defaultValue={initialValues?.name} />
      </div>

      {/* Both selects start blank on create rather than defaulting to the
          first trade in the list — a required field that arrives
          pre-filled gets submitted unread, and everyone silently becomes a
          carpenter. `required` plus the disabled placeholder makes the
          browser block submission until one is actually chosen. */}
      <div className={styles.field}>
        <label htmlFor="craft">Craft</label>
        <select id="craft" name="craft" required defaultValue={initialValues?.craft ?? ""}>
          <option value="" disabled>
            Select a craft
          </option>
          {CRAFT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="classification">Classification</label>
        <select
          id="classification"
          name="classification"
          required
          defaultValue={initialValues?.classification ?? ""}
        >
          <option value="" disabled>
            Select a classification
          </option>
          {CLASSIFICATION_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="certifications">Certifications (comma-separated)</label>
        <input
          id="certifications"
          name="certifications"
          defaultValue={initialValues?.certifications.join(", ")}
          placeholder="OSHA-30, Crane Operator"
        />
      </div>

      <div className={styles.checkboxField}>
        <input
          id="isActive"
          name="isActive"
          type="checkbox"
          defaultChecked={initialValues?.isActive ?? true}
        />
        <label htmlFor="isActive">Active</label>
      </div>

      {state.error && <p className={styles.error}>{state.error}</p>}
      <button type="submit" className={styles.submit} disabled={isPending}>
        {isPending ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
