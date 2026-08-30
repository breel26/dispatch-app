"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createJob, updateJob, updateJobStatus, cancelJob } from "@/modules/jobs/repository";
import { toActionErrorMessage } from "@/modules/shared/actionError";
import { requireAuthContext } from "@/modules/shared/currentUser";
import { assertCan } from "@/modules/shared/authContext";
import type { JobStatus } from "@/modules/jobs/types";

export interface ActionState {
  error?: string;
}

// Every action resolves the caller's org before touching the database and
// passes it down. The middleware already blocks unauthenticated requests;
// this is what stops an authenticated user from reaching another tenant's
// rows, which the middleware cannot do on its own.
//
// Note that requireAuthContext() goes INSIDE the try: it throws for a
// signed-out caller, and that should surface as an inline message rather
// than an unhandled exception. redirect() stays OUTSIDE, because Next
// signals navigation by throwing and catching it here would swallow the
// navigation and report it as a failure.

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
    const ctx = await requireAuthContext();
    job = await createJob(ctx.orgId, buildJobInput(formData));
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
    const ctx = await requireAuthContext();
    await updateJob(ctx.orgId, jobId, buildJobInput(formData));
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
    const ctx = await requireAuthContext();
    await updateJobStatus(ctx.orgId, jobId, status);
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  return {};
}

// Cancelling a job is admin-only: it stops work that crews and vendors are
// already scheduled against.
export async function cancelJobAction(jobId: string): Promise<ActionState> {
  try {
    const ctx = await requireAuthContext();
    assertCan(ctx, "cancelJob");
    await cancelJob(ctx.orgId, jobId);
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath("/jobs");
  revalidatePath(`/jobs/${jobId}`);
  return {};
}
