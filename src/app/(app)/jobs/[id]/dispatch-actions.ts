"use server";

import { revalidatePath } from "next/cache";
import { createAssignment, cancelAssignment } from "@/modules/dispatch/repository";
import { toActionErrorMessage } from "@/modules/shared/actionError";
import type { ActionState } from "../actions";

const RESOURCE_TYPES = ["PERSONNEL", "MATERIAL", "EQUIPMENT"] as const;
type ResourceType = (typeof RESOURCE_TYPES)[number];

function isResourceType(value: string | undefined): value is ResourceType {
  return !!value && (RESOURCE_TYPES as readonly string[]).includes(value);
}

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  if (value === null) return undefined;
  const str = value.toString();
  return str === "" ? undefined : str;
}

export async function createAssignmentAction(
  jobId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const resourceType = formData.get("resourceType")?.toString();
  if (!isResourceType(resourceType)) {
    return { error: "resourceType is required" };
  }
  const startAtRaw = formData.get("startAt")?.toString();
  if (!startAtRaw) {
    return { error: "startAt is required" };
  }

  const resourceId = formData.get("resourceId")?.toString();
  const quantityRaw = emptyToUndefined(formData.get("quantity"));
  const endAtRaw = emptyToUndefined(formData.get("endAt"));

  const input = {
    jobId,
    resourceType,
    personnelId: resourceType === "PERSONNEL" ? resourceId : undefined,
    materialId: resourceType === "MATERIAL" ? resourceId : undefined,
    equipmentId: resourceType === "EQUIPMENT" ? resourceId : undefined,
    quantity: quantityRaw ? Number(quantityRaw) : undefined,
    startAt: new Date(startAtRaw),
    endAt: endAtRaw ? new Date(endAtRaw) : undefined,
    notes: emptyToUndefined(formData.get("notes")),
  };

  try {
    await createAssignment(input);
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath(`/jobs/${jobId}`);
  return {};
}

export async function cancelAssignmentAction(jobId: string, assignmentId: string): Promise<ActionState> {
  try {
    await cancelAssignment(assignmentId);
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath(`/jobs/${jobId}`);
  return {};
}
