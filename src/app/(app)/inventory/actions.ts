"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createPersonnel,
  updatePersonnel,
  deactivatePersonnel,
  createMaterial,
  updateMaterial,
  adjustMaterialQuantity,
  createEquipment,
  updateEquipment,
} from "@/modules/inventory/repository";
import { isCraft, isClassification, type Craft, type Classification } from "@/modules/inventory/craft";
import type { CreatePersonnelInput, UpdatePersonnelInput } from "@/modules/inventory/schemas";
import { toActionErrorMessage } from "@/modules/shared/actionError";
import { requireAuthContext } from "@/modules/shared/currentUser";
import { assertCan } from "@/modules/shared/authContext";

export interface ActionState {
  error?: string;
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  if (value === null) return undefined;
  const str = value.toString();
  return str === "" ? undefined : str;
}

function parseCertifications(value: FormDataEntryValue | null): string[] {
  if (value === null) return [];
  return value
    .toString()
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// --- Personnel ---

// craft and classification arrive from FormData as untyped strings, so they
// are narrowed here before reaching the repository. Unlike equipment status
// below - which falls back to AVAILABLE when unset - an unrecognised value
// is refused outright: these are required fields, and quietly defaulting
// someone to the wrong trade is worse than making them pick again.
type CraftClassificationResult =
  | { ok: true; craft: Craft; classification: Classification }
  | { ok: false; error: string };

function readCraftAndClassification(formData: FormData): CraftClassificationResult {
  const craft = formData.get("craft")?.toString() ?? "";
  if (!isCraft(craft)) {
    return { ok: false, error: "Select a craft" };
  }
  const classification = formData.get("classification")?.toString() ?? "";
  if (!isClassification(classification)) {
    return { ok: false, error: "Select a classification" };
  }
  return { ok: true, craft, classification };
}

// z.coerce.date() accepts a raw string and validates the coerced result
// itself (an empty or unparsable string becomes a real "Invalid date" Zod
// issue, not a silent corruption), but its declared OUTPUT type is Date -
// so the object literal handed to the schema has to already be a Date,
// same as toOptionalDate does for jobs in jobs/actions.ts.
function toDate(value: FormDataEntryValue | null): Date {
  return new Date(value?.toString() ?? "");
}

// The HR fields shared by create and update - everything except ssn and
// driversLicenseNumber, which need different handling per form (see
// buildUpdatePersonnelInput below) and so are read separately by each
// builder. Required fields are passed through raw rather than via
// emptyToUndefined, matching how buildJobInput treats Job's required
// fields: clearing one on the edit form is a real validation error
// ("first name is required"), not a silent no-op.
function readCommonPersonnelFields(formData: FormData) {
  return {
    employeeId: formData.get("employeeId")?.toString() ?? "",
    firstName: formData.get("firstName")?.toString() ?? "",
    middleName: emptyToUndefined(formData.get("middleName")),
    lastName: formData.get("lastName")?.toString() ?? "",
    dateOfBirth: toDate(formData.get("dateOfBirth")),
    hireDate: toDate(formData.get("hireDate")),
    homeStreet1: formData.get("homeStreet1")?.toString() ?? "",
    homeStreet2: emptyToUndefined(formData.get("homeStreet2")),
    homeCity: formData.get("homeCity")?.toString() ?? "",
    homeState: formData.get("homeState")?.toString() ?? "",
    homePostalCode: formData.get("homePostalCode")?.toString() ?? "",
    // createPersonnelSchema defaults homeCountry to "US" - mirrored here
    // (rather than left undefined) so this satisfies the schema's
    // post-default output type, which requires a string. Matches the same
    // convention already used below for equipment status.
    homeCountry: formData.get("homeCountry")?.toString() || "US",
    phoneNumber: formData.get("phoneNumber")?.toString() ?? "",
    certifications: parseCertifications(formData.get("certifications")),
    isActive: formData.get("isActive") === "on",
  };
}

type PersonnelInputResult<T> = { ok: true; value: T } | { ok: false; error: string };

function buildCreatePersonnelInput(formData: FormData): PersonnelInputResult<CreatePersonnelInput> {
  const cc = readCraftAndClassification(formData);
  if (!cc.ok) return cc;

  return {
    ok: true,
    value: {
      ...readCommonPersonnelFields(formData),
      // Required on create - there is no existing encrypted value to fall
      // back to for a worker who does not exist yet, so a blank field here
      // must fail validation rather than being silently treated as "no
      // change" the way it is on update.
      ssn: formData.get("ssn")?.toString() ?? "",
      driversLicenseNumber: formData.get("driversLicenseNumber")?.toString() ?? "",
      craft: cc.craft,
      classification: cc.classification,
    },
  };
}

// The edit form never prefills ssn or driversLicenseNumber (see
// PersonnelForm - decrypting an existing SSN just to put it back in a
// visible input field is not something this app does), so on every edit
// page load those two inputs start blank regardless of whether a real
// encrypted value already exists. A blank submission therefore has to mean
// "leave the encrypted value as it is", not "clear it" and not "this field
// is required" - emptyToUndefined is what makes updatePersonnelSchema's
// optional ssn/driversLicenseNumber fields skip validation entirely rather
// than reject an empty string.
function buildUpdatePersonnelInput(formData: FormData): PersonnelInputResult<UpdatePersonnelInput> {
  const cc = readCraftAndClassification(formData);
  if (!cc.ok) return cc;

  return {
    ok: true,
    value: {
      ...readCommonPersonnelFields(formData),
      ssn: emptyToUndefined(formData.get("ssn")),
      driversLicenseNumber: emptyToUndefined(formData.get("driversLicenseNumber")),
      craft: cc.craft,
      classification: cc.classification,
    },
  };
}

export async function createPersonnelAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const input = buildCreatePersonnelInput(formData);
  if (!input.ok) return { error: input.error };

  let personnel;
  try {
    const ctx = await requireAuthContext();
    personnel = await createPersonnel(ctx.orgId, input.value);
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath("/inventory/personnel");
  redirect(`/inventory/personnel/${personnel.id}`);
}

export async function updatePersonnelAction(
  personnelId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const input = buildUpdatePersonnelInput(formData);
  if (!input.ok) return { error: input.error };

  try {
    const ctx = await requireAuthContext();
    await updatePersonnel(ctx.orgId, personnelId, input.value);
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath("/inventory/personnel");
  revalidatePath(`/inventory/personnel/${personnelId}`);
  redirect(`/inventory/personnel/${personnelId}`);
}

export async function deactivatePersonnelAction(personnelId: string): Promise<ActionState> {
  try {
    const ctx = await requireAuthContext();
    await deactivatePersonnel(ctx.orgId, personnelId);
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath("/inventory/personnel");
  revalidatePath(`/inventory/personnel/${personnelId}`);
  return {};
}

// --- Material ---

function buildCreateMaterialInput(formData: FormData) {
  const quantityRaw = emptyToUndefined(formData.get("quantityOnHand"));
  const reorderRaw = emptyToUndefined(formData.get("reorderThreshold"));
  return {
    sku: formData.get("sku")?.toString() ?? "",
    name: formData.get("name")?.toString() ?? "",
    unit: formData.get("unit")?.toString() ?? "",
    // createMaterialSchema defaults quantityOnHand to 0 — mirrored here
    // (rather than left undefined) so this satisfies the schema's
    // post-default output type, which requires a number.
    quantityOnHand: quantityRaw ? Number(quantityRaw) : 0,
    reorderThreshold: reorderRaw ? Number(reorderRaw) : undefined,
  };
}

export async function createMaterialAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let material;
  try {
    const ctx = await requireAuthContext();
    material = await createMaterial(ctx.orgId, buildCreateMaterialInput(formData), ctx.userId);
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath("/inventory/materials");
  redirect(`/inventory/materials/${material.id}`);
}

// Deliberately excludes quantityOnHand. Stock is a rollup of the movement
// ledger, so setting it directly would leave a number nothing explains;
// changes go through adjustMaterialQuantityAction, which records a reason.
// updateMaterialSchema no longer accepts the field at all, so this is now
// enforced by the schema rather than by convention.
export async function updateMaterialAction(
  materialId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const reorderRaw = emptyToUndefined(formData.get("reorderThreshold"));
  try {
    const ctx = await requireAuthContext();
    await updateMaterial(ctx.orgId, materialId, {
      name: formData.get("name")?.toString() ?? "",
      unit: formData.get("unit")?.toString() ?? "",
      reorderThreshold: reorderRaw ? Number(reorderRaw) : undefined,
    });
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath("/inventory/materials");
  revalidatePath(`/inventory/materials/${materialId}`);
  redirect(`/inventory/materials/${materialId}`);
}

export async function adjustMaterialQuantityAction(
  materialId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const deltaRaw = formData.get("delta")?.toString();
  const reason = formData.get("reason")?.toString();
  if (!deltaRaw || !reason) {
    return { error: "delta and reason are required" };
  }
  try {
    const ctx = await requireAuthContext();
    // Adjusting stock by hand overrides what the ledger derived from
    // assignments and receipts, so it is admin-only.
    assertCan(ctx, "adjustStock");
    await adjustMaterialQuantity(
      ctx.orgId,
      { materialId, delta: Number(deltaRaw), reason },
      ctx.userId
    );
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath(`/inventory/materials/${materialId}`);
  revalidatePath("/inventory/materials");
  return {};
}

// --- Equipment ---

const EQUIPMENT_STATUSES = ["AVAILABLE", "ASSIGNED", "MAINTENANCE", "OUT_OF_SERVICE"] as const;
type EquipmentStatusValue = (typeof EQUIPMENT_STATUSES)[number];

function isEquipmentStatus(value: string | undefined): value is EquipmentStatusValue {
  return !!value && (EQUIPMENT_STATUSES as readonly string[]).includes(value);
}

// EquipmentForm submits the fleet number as three separate fields (type
// code, capacity code, sequence) rather than one pre-joined string, so the
// dispatcher picks type/capacity off the registry dropdowns instead of
// typing raw digits. Joined here into the single XX-XX-XXXX string
// createEquipmentSchema actually validates and normalizes.
function joinEquipmentNumber(formData: FormData): string {
  const type = formData.get("equipmentNumberType")?.toString() ?? "";
  const capacity = formData.get("equipmentNumberCapacity")?.toString() ?? "";
  const sequence = formData.get("equipmentNumberSequence")?.toString() ?? "";
  return `${type}-${capacity}-${sequence}`;
}

export async function createEquipmentAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const statusRaw = formData.get("status")?.toString();
  const operatingHoursRaw = emptyToUndefined(formData.get("operatingHours"));
  let equipment;
  try {
    const ctx = await requireAuthContext();
    equipment = await createEquipment(ctx.orgId, {
      equipmentNumber: joinEquipmentNumber(formData),
      name: formData.get("name")?.toString() ?? "",
      type: formData.get("type")?.toString() ?? "",
      make: formData.get("make")?.toString() ?? "",
      model: formData.get("model")?.toString() ?? "",
      // createEquipmentSchema defaults operatingHours to 0 for genuinely
      // new equipment - mirrored here so this satisfies the schema's
      // post-default output type, which requires a number.
      operatingHours: operatingHoursRaw ? Number(operatingHoursRaw) : 0,
      requiredCertifications: parseCertifications(formData.get("requiredCertifications")),
      // createEquipmentSchema defaults status to AVAILABLE — mirrored
      // here so this satisfies the schema's post-default output type.
      status: isEquipmentStatus(statusRaw) ? statusRaw : "AVAILABLE",
      location: emptyToUndefined(formData.get("location")),
    });
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath("/inventory/equipment");
  redirect(`/inventory/equipment/${equipment.id}`);
}

export async function updateEquipmentAction(
  equipmentId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const statusRaw = formData.get("status")?.toString();
  const operatingHoursRaw = emptyToUndefined(formData.get("operatingHours"));
  try {
    const ctx = await requireAuthContext();
    await updateEquipment(ctx.orgId, equipmentId, {
      equipmentNumber: joinEquipmentNumber(formData),
      name: formData.get("name")?.toString() ?? "",
      type: formData.get("type")?.toString() ?? "",
      make: formData.get("make")?.toString() ?? "",
      model: formData.get("model")?.toString() ?? "",
      operatingHours: operatingHoursRaw ? Number(operatingHoursRaw) : undefined,
      requiredCertifications: parseCertifications(formData.get("requiredCertifications")),
      status: isEquipmentStatus(statusRaw) ? statusRaw : undefined,
      location: emptyToUndefined(formData.get("location")),
    });
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath("/inventory/equipment");
  revalidatePath(`/inventory/equipment/${equipmentId}`);
  redirect(`/inventory/equipment/${equipmentId}`);
}
