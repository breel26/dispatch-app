"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createJob, updateJob, updateJobStatus, cancelJob } from "@/modules/jobs/repository";
import { toActionErrorMessage } from "@/modules/shared/actionError";
import type { JobStatus } from "@/modules/jobs/types";

export interface ActionState {
  error?: string;
}

// FormData values are always strings; an omitted optional field still
// arrives as "" rather than being absent. The Zod schemas use
// z.coerce.date() for date fields (which turns "" into an Invalid Date,
// not undefined), so empty strings must be normalized to undefined
// before validation.
function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  if (value === null) return undefined;
  const str = value.toString();
  return str === "" ? undefined : str;
}

function toOptionalDate(value: FormDataEntryValue | null): Date | undefined {
  const str = emptyToUndefined(value);
  return str ? new Date(str) : undefined;
}

function buildJobInput(formData: FormData) {
  return {
    jobNumber: formData.get("jobNumber")?.toString() ?? "",
    name: formData.get("name")?.toString() ?? "",
    siteAddress: formData.get("siteAddress")?.toString() ?? "",
    startDate: toOptionalDate(formData.get("startDate")),
    endDate: toOptionalDate(formData.get("endDate")),
    notes: emptyToUndefined(formData.get("notes")),
  };
}

export async function createJobAction(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  let job;
  try {
    job = await createJob(buildJobInput(formData));
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath("/jobs");
  redirect(`/jobs/${job.id}`);
}

export async function updateJobAction(
  jobId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  try {
    await updateJob(jobId, buildJobInput(formData));
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function updateJobStatusAction(
  jobId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const status = formData.get("status")?.toString() as JobStatus | undefined;
  if (!status) {
    return { error: "status is required" };
  }
  try {
    await updateJobStatus(jobId, status);
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  return {};
}

export async function cancelJobAction(jobId: string): Promise<ActionState> {
  try {
    await cancelJob(jobId);
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  return {};
}
