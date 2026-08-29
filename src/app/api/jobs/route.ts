import { NextRequest, NextResponse } from "next/server";
import { createJob, listJobs } from "@/modules/jobs/repository";
import { handleApiError } from "@/modules/shared/apiError";
import type { JobStatus } from "@/modules/jobs/types";

export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get("status") as JobStatus | null;
    const jobs = await listJobs({ status: status ?? undefined });
    return NextResponse.json(jobs);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const job = await createJob(body);
    return NextResponse.json(job, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
