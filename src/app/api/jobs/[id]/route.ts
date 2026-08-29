import { NextRequest, NextResponse } from "next/server";
import { getJobById, updateJob, updateJobStatus } from "@/modules/jobs/repository";
import { handleApiError } from "@/modules/shared/apiError";
import { jobStatusSchema } from "@/modules/jobs/schemas";
import type { JobStatus } from "@/modules/jobs/types";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const job = await getJobById(id);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    return NextResponse.json(job);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    // A status-only update goes through updateJobStatus so the legal
    // transition rules are enforced; anything else goes through the
    // general updateJob. Keeping these separate rather than letting
    // updateJob silently accept a status field bypasses the whole
    // point of statusTransitions.ts.
    if (typeof body.status === "string" && Object.keys(body).length === 1) {
      const status = jobStatusSchema.parse(body.status) as JobStatus;
      const job = await updateJobStatus(id, status);
      return NextResponse.json(job);
    }

    const job = await updateJob(id, body);
    return NextResponse.json(job);
  } catch (err) {
    return handleApiError(err);
  }
}
