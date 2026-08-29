import { NextRequest, NextResponse } from "next/server";
import { createAssignment, listAssignmentsForJob } from "@/modules/dispatch/repository";
import { handleApiError } from "@/modules/shared/apiError";

export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ error: "jobId query param is required" }, { status: 400 });
    }
    const assignments = await listAssignmentsForJob(jobId);
    return NextResponse.json(assignments);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const assignment = await createAssignment(body);
    return NextResponse.json(assignment, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
