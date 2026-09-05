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
    firstName: string;
    middleName: string | null;
    lastName: string;
    dateOfBirth: string; // yyyy-mm-dd, matching <input type="date">
    hireDate: string; // yyyy-mm-dd
    // Never the decrypted value itself - see the note on
    // modules/inventory/repository.ts about not forwarding
    // ssnEncrypted/driversLicenseNumberEncrypted as a prop. Just enough to
    // tell the dispatcher whether one needs entering.
    hasSsnOnFile: boolean;
    hasDriversLicenseOnFile: boolean;
    homeStreet1: string;
    homeStreet2: string | null;
    homeCity: string;
    homeState: string;
    homePostalCode: string;
    phoneNumber: string;
    craft: Craft;
    classification: Classification;
    certifications: string[];
    isActive: boolean;
  };
}

export default function PersonnelForm({ action, submitLabel, initialValues }: PersonnelFormProps) {
  const [state, formAction, isPending] = useActionState(action, {} as ActionState);
  const isEdit = initialValues !== undefined;

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
        <label htmlFor="firstName">First name</label>
        <input id="firstName" name="firstName" required defaultValue={initialValues?.firstName} />
      </div>

      <div className={styles.field}>
        <label htmlFor="middleName">Middle name</label>
        <input
          id="middleName"
          name="middleName"
          defaultValue={initialValues?.middleName ?? undefined}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="lastName">Last name</label>
        <input id="lastName" name="lastName" required defaultValue={initialValues?.lastName} />
      </div>

      <div className={styles.field}>
        <label htmlFor="dateOfBirth">Date of birth</label>
        <input
          id="dateOfBirth"
          name="dateOfBirth"
          type="date"
          required
          defaultValue={initialValues?.dateOfBirth}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="hireDate">Hire date</label>
        <input
          id="hireDate"
          name="hireDate"
          type="date"
          required
          defaultValue={initialValues?.hireDate}
        />
      </div>

      {/* SSN and license number fields are never pre-filled with the
          existing (decrypted) value, on either create or edit - this app
          never puts a full SSN into a rendered page at all, form inputs
          included. On edit, leaving the field blank means "keep the
          current value"; the hint below says whether there is one to keep. */}
      <div className={styles.field}>
        <label htmlFor="ssn">Social Security Number</label>
        <input
          id="ssn"
          name="ssn"
          required={!isEdit}
          inputMode="numeric"
          placeholder="123-45-6789"
          autoComplete="off"
        />
        <p className={styles.hint}>
          {isEdit
            ? initialValues.hasSsnOnFile
              ? "On file. Leave blank to keep it, or enter a new one to replace it."
              : "Not on file. Enter one to add it."
            : "Format: XXX-XX-XXXX. Stored encrypted, never displayed again."}
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="driversLicenseNumber">Driver license number</label>
        <input
          id="driversLicenseNumber"
          name="driversLicenseNumber"
          required={!isEdit}
          autoComplete="off"
        />
        <p className={styles.hint}>
          {isEdit
            ? initialValues.hasDriversLicenseOnFile
              ? "On file. Leave blank to keep it, or enter a new one to replace it."
              : "Not on file. Enter one to add it."
            : "Stored encrypted, never displayed again."}
        </p>
      </div>

      <div className={styles.field}>
        <label htmlFor="phoneNumber">Phone number</label>
        <input
          id="phoneNumber"
          name="phoneNumber"
          required
          placeholder="(555) 123-4567"
          defaultValue={initialValues?.phoneNumber}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="homeStreet1">Street address</label>
        <input
          id="homeStreet1"
          name="homeStreet1"
          required
          defaultValue={initialValues?.homeStreet1}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="homeStreet2">Street address, line 2</label>
        <input
          id="homeStreet2"
          name="homeStreet2"
          defaultValue={initialValues?.homeStreet2 ?? undefined}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="homeCity">City</label>
        <input id="homeCity" name="homeCity" required defaultValue={initialValues?.homeCity} />
      </div>

      <div className={styles.field}>
        <label htmlFor="homeState">State</label>
        <input
          id="homeState"
          name="homeState"
          required
          maxLength={2}
          placeholder="CA"
          defaultValue={initialValues?.homeState}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor="homePostalCode">Postal code</label>
        <input
          id="homePostalCode"
          name="homePostalCode"
          required
          placeholder="94105"
          defaultValue={initialValues?.homePostalCode}
        />
      </div>

      {/* Both selects start blank on create rather than defaulting to the
          first trade in the list, a required field that arrives pre-filled
          gets submitted unread, and everyone silently becomes a carpenter.
          `required` plus the disabled placeholder makes the browser block
          submission until one is actually chosen. */}
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
