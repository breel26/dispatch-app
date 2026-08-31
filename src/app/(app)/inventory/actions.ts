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
import { isCraft, isClassification } from "@/modules/inventory/craft";
import type { CreatePersonnelInput } from "@/modules/inventory/schemas";
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
type PersonnelInputResult =
  | { ok: true; value: CreatePersonnelInput }
  | { ok: false; error: string };

function buildPersonnelInput(formData: FormData): PersonnelInputResult {
  const craft = formData.get("craft")?.toString() ?? "";
  if (!isCraft(craft)) {
    return { ok: false, error: "Select a craft" };
  }

  const classification = formData.get("classification")?.toString() ?? "";
  if (!isClassification(classification)) {
    return { ok: false, error: "Select a classification" };
  }

  return {
    ok: true,
    value: {
      name: formData.get("name")?.toString() ?? "",
      craft,
      classification,
      certifications: parseCertifications(formData.get("certifications")),
      isActive: formData.get("isActive") === "on",
    },
  };
}

export async function createPersonnelAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const input = buildPersonnelInput(formData);
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
  const input = buildPersonnelInput(formData);
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

export async function createEquipmentAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const statusRaw = formData.get("status")?.toString();
  let equipment;
  try {
    const ctx = await requireAuthContext();
    equipment = await createEquipment(ctx.orgId, {
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
    const ctx = await requireAuthContext();
    await updateEquipment(ctx.orgId, equipmentId, {
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
