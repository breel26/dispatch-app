"use client";

import { useActionState, useState, useMemo } from "react";
import { createAssignmentAction } from "./dispatch-actions";
import type { ActionState } from "../actions";
import SearchableSelect from "./SearchableSelect";
import {
  filterByNumber,
  ownersFor,
  typesFor,
  unitsFor,
  equipmentOptionLabel,
  type EquipmentUnitOption,
} from "./equipmentPicker";
import styles from "./AssignmentForm.module.css";

interface ResourceOption {
  id: string;
  label: string;
}

interface AssignmentFormProps {
  jobId: string;
  personnelOptions: ResourceOption[];
  materialOptions: ResourceOption[];
  equipmentOptions: EquipmentUnitOption[];
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
  const [resourceId, setResourceId] = useState("");

  // Equipment is found two ways: browse by owner ("Company Owned" or a
  // rental vendor) then type, or type a fleet number to jump straight to
  // it. Both work at once - the number narrows owners/types/units
  // together, so typing "0002" while nothing else is picked leaves only
  // the owner(s) and type(s) that actually have a matching unit.
  const [numberQuery, setNumberQuery] = useState("");
  const [equipmentOwner, setEquipmentOwner] = useState("");
  const [equipmentType, setEquipmentType] = useState("");
  const [equipmentUnitId, setEquipmentUnitId] = useState("");

  const narrowedByNumber = useMemo(
    () => filterByNumber(equipmentOptions, numberQuery),
    [equipmentOptions, numberQuery]
  );
  const owners = useMemo(() => ownersFor(narrowedByNumber), [narrowedByNumber]);
  const typesForOwner = useMemo(
    () => typesFor(narrowedByNumber, equipmentOwner),
    [narrowedByNumber, equipmentOwner]
  );
  const matchingUnits = useMemo(
    () => unitsFor(narrowedByNumber, equipmentOwner, equipmentType),
    [narrowedByNumber, equipmentOwner, equipmentType]
  );

  function resetResourceSelection(nextType: ResourceType) {
    setResourceType(nextType);
    setResourceId("");
    setNumberQuery("");
    setEquipmentOwner("");
    setEquipmentType("");
    setEquipmentUnitId("");
  }

  // Typing a fleet number can rule out the owner/type already picked (e.g.
  // an owner with no unit matching that number) - when that happens, clear
  // the now-invalid selections downstream rather than leaving a select
  // showing a value that is no longer one of its own options.
  function handleNumberQueryChange(text: string) {
    setNumberQuery(text);
    const narrowed = filterByNumber(equipmentOptions, text);

    const validOwners = ownersFor(narrowed);
    if (equipmentOwner && !validOwners.includes(equipmentOwner)) {
      setEquipmentOwner("");
      setEquipmentType("");
      setEquipmentUnitId("");
      return;
    }

    const validTypes = typesFor(narrowed, equipmentOwner);
    if (equipmentType && !validTypes.includes(equipmentType)) {
      setEquipmentType("");
      setEquipmentUnitId("");
      return;
    }

    const validUnitIds = unitsFor(narrowed, equipmentOwner, equipmentType).map((u) => u.id);
    if (equipmentUnitId && !validUnitIds.includes(equipmentUnitId)) {
      setEquipmentUnitId("");
    }
  }

  const options = resourceType === "PERSONNEL" ? personnelOptions : materialOptions;
  const canSubmit =
    resourceType === "EQUIPMENT" ? !!equipmentUnitId : !!resourceId;

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.field}>
        <label htmlFor="resourceType">Type</label>
        <select
          id="resourceType"
          name="resourceType"
          value={resourceType}
          onChange={(e) => resetResourceSelection(e.target.value as ResourceType)}
        >
          <option value="PERSONNEL">Personnel</option>
          <option value="MATERIAL">Material</option>
          <option value="EQUIPMENT">Equipment</option>
        </select>
      </div>

      {resourceType === "EQUIPMENT" ? (
        <>
          <div className={styles.field}>
            <label htmlFor="equipmentNumberQuery">Fleet number</label>
            <input
              id="equipmentNumberQuery"
              value={numberQuery}
              onChange={(e) => handleNumberQueryChange(e.target.value)}
              placeholder="Type a fleet number..."
            />
          </div>

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

          {/* Always shown once a type is picked - even a single matching
              unit is listed by its fleet number rather than auto-filled,
              so the number is always visible and always an explicit
              choice. */}
          {equipmentType && (
            <div className={styles.field}>
              <label htmlFor="equipmentUnitId">Unit</label>
              <select
                id="equipmentUnitId"
                value={equipmentUnitId}
                onChange={(e) => setEquipmentUnitId(e.target.value)}
                required
              >
                <option value="" disabled>
                  {matchingUnits.length === 0 ? "No matching equipment" : "Select a unit"}
                </option>
                {matchingUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {equipmentOptionLabel(unit)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <input type="hidden" name="resourceId" value={equipmentUnitId} />
        </>
      ) : (
        <div className={styles.field}>
          <label htmlFor="resourceId">Resource</label>
          <SearchableSelect
            name="resourceId"
            options={options}
            value={resourceId}
            onChange={setResourceId}
            placeholder={
              resourceType === "PERSONNEL" ? "Search personnel..." : "Search materials..."
            }
          />
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

      <button type="submit" className={styles.submit} disabled={isPending || !canSubmit}>
        {isPending ? "Assigning..." : "Add Assignment"}
      </button>

      {state.error && <p className={styles.error}>{state.error}</p>}
    </form>
  );
}
