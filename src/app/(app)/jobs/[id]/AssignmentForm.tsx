"use client";

import { useActionState, useState, useMemo } from "react";
import { createAssignmentAction } from "./dispatch-actions";
import type { ActionState } from "../actions";
import styles from "./AssignmentForm.module.css";

interface ResourceOption {
  id: string;
  label: string;
}

// Equipment carries two extra facts a dispatcher actually picks by:
// who it belongs to (the company itself, or which rental vendor) and
// what kind of machine it is. Personnel and Material stay flat - a
// worker is picked by name/trade in one step, and there is no
// "ownership" dimension for a material.
interface EquipmentOption extends ResourceOption {
  owner: string;
  type: string;
}

interface AssignmentFormProps {
  jobId: string;
  personnelOptions: ResourceOption[];
  materialOptions: ResourceOption[];
  equipmentOptions: EquipmentOption[];
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

  // Equipment selection is owner first, then type - "Company Owned", then
  // "Excavator" - matching how a dispatcher actually thinks about picking
  // a machine, rather than one flat list mixing vendors and equipment
  // together.
  const owners = useMemo(
    () => Array.from(new Set(equipmentOptions.map((o) => o.owner))).sort(),
    [equipmentOptions]
  );
  const [equipmentOwner, setEquipmentOwner] = useState<string>("");

  const typesForOwner = useMemo(
    () =>
      Array.from(
        new Set(equipmentOptions.filter((o) => o.owner === equipmentOwner).map((o) => o.type))
      ).sort(),
    [equipmentOptions, equipmentOwner]
  );
  const [equipmentType, setEquipmentType] = useState<string>("");

  // The common case is exactly one unit per owner+type pair, in which
  // case picking the type is enough to identify the equipment and no
  // further choice is needed. If the fleet ever has two units sharing an
  // owner and type, this list has more than one entry and a third select
  // appears so the pair alone is not treated as ambiguous.
  const matchingUnits = useMemo(
    () => equipmentOptions.filter((o) => o.owner === equipmentOwner && o.type === equipmentType),
    [equipmentOptions, equipmentOwner, equipmentType]
  );
  const [equipmentUnitId, setEquipmentUnitId] = useState<string>("");

  const resolvedEquipmentId =
    matchingUnits.length === 1 ? matchingUnits[0].id : equipmentUnitId;

  const options = resourceType === "PERSONNEL" ? personnelOptions : materialOptions;

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

      {resourceType === "EQUIPMENT" ? (
        <>
          <div className={styles.field}>
            <label htmlFor="equipmentOwner">Owned by</label>
            <select
              id="equipmentOwner"
              value={equipmentOwner}
              onChange={(e) => {
                setEquipmentOwner(e.target.value);
                setEquipmentType("");
                setEquipmentUnitId("");
              }}
              required
            >
              <option value="" disabled>
                Select company owned or a rental vendor
              </option>
              {owners.map((owner) => (
                <option key={owner} value={owner}>
                  {owner}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="equipmentType">Equipment type</label>
            <select
              id="equipmentType"
              value={equipmentType}
              onChange={(e) => {
                setEquipmentType(e.target.value);
                setEquipmentUnitId("");
              }}
              required
              disabled={!equipmentOwner}
            >
              <option value="" disabled>
                {equipmentOwner ? "Select a type" : "Select an owner first"}
              </option>
              {typesForOwner.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Only shown when owner+type does not already narrow to a
              single machine - the common case skips straight past this. */}
          {equipmentType && matchingUnits.length > 1 && (
            <div className={styles.field}>
              <label htmlFor="equipmentUnitId">Unit</label>
              <select
                id="equipmentUnitId"
                value={equipmentUnitId}
                onChange={(e) => setEquipmentUnitId(e.target.value)}
                required
              >
                <option value="" disabled>
                  Multiple units match - select one
                </option>
                {matchingUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <input type="hidden" name="resourceId" value={resolvedEquipmentId} />
        </>
      ) : (
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
      )}

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

      <button
        type="submit"
        className={styles.submit}
        disabled={isPending || (resourceType === "EQUIPMENT" && !resolvedEquipmentId)}
      >
        {isPending ? "Assigning..." : "Add Assignment"}
      </button>

      {state.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
