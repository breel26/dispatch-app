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
import { toActionErrorMessage } from "@/modules/shared/actionError";

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

function buildPersonnelInput(formData: FormData) {
  return {
    name: formData.get("name")?.toString() ?? "",
    role: formData.get("role")?.toString() ?? "",
    certifications: parseCertifications(formData.get("certifications")),
    isActive: formData.get("isActive") === "on",
  };
}

export async function createPersonnelAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let personnel;
  try {
    personnel = await createPersonnel(buildPersonnelInput(formData));
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
  try {
    await updatePersonnel(personnelId, buildPersonnelInput(formData));
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath("/inventory/personnel");
  revalidatePath(`/inventory/personnel/${personnelId}`);
  redirect(`/inventory/personnel/${personnelId}`);
}

export async function deactivatePersonnelAction(personnelId: string): Promise<ActionState> {
  try {
    await deactivatePersonnel(personnelId);
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
    material = await createMaterial(buildCreateMaterialInput(formData));
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath("/inventory/materials");
  redirect(`/inventory/materials/${material.id}`);
}

// Deliberately excludes quantityOnHand — quantity changes go through
// adjustMaterialQuantityAction below so the audit-trail "reason" field
// can't be bypassed by editing quantity here instead.
export async function updateMaterialAction(
  materialId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const reorderRaw = emptyToUndefined(formData.get("reorderThreshold"));
  try {
    await updateMaterial(materialId, {
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
    await adjustMaterialQuantity({ materialId, delta: Number(deltaRaw), reason });
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

export async function createEquipmentAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const statusRaw = formData.get("status")?.toString();
  let equipment;
  try {
    equipment = await createEquipment({
      name: formData.get("name")?.toString() ?? "",
      type: formData.get("type")?.toString() ?? "",
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
  try {
    await updateEquipment(equipmentId, {
      name: formData.get("name")?.toString() ?? "",
      type: formData.get("type")?.toString() ?? "",
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
