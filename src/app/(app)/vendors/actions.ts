"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createVendor, updateVendor, deleteVendor } from "@/modules/vendors/repository";
import { toActionErrorMessage } from "@/modules/shared/actionError";

export interface ActionState {
  error?: string;
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  if (value === null) return undefined;
  const str = value.toString();
  return str === "" ? undefined : str;
}

function parseCategories(value: FormDataEntryValue | null): string[] {
  if (value === null) return [];
  return value
    .toString()
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function buildVendorInput(formData: FormData) {
  return {
    name: formData.get("name")?.toString() ?? "",
    email: formData.get("email")?.toString() ?? "",
    phone: emptyToUndefined(formData.get("phone")),
    categories: parseCategories(formData.get("categories")),
  };
}

export async function createVendorAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let vendor;
  try {
    vendor = await createVendor(buildVendorInput(formData));
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath("/vendors");
  redirect(`/vendors/${vendor.id}`);
}

export async function updateVendorAction(
  vendorId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await updateVendor(vendorId, buildVendorInput(formData));
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath("/vendors");
  revalidatePath(`/vendors/${vendorId}`);
  redirect(`/vendors/${vendorId}`);
}

export async function deleteVendorAction(vendorId: string): Promise<ActionState> {
  try {
    await deleteVendor(vendorId);
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath("/vendors");
  redirect("/vendors");
}
