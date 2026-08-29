import { NextRequest, NextResponse } from "next/server";
import { createPurchaseOrder, compareQuotesForJob } from "@/modules/procurement/repository";
import { handleApiError } from "@/modules/shared/apiError";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const po = await createPurchaseOrder(body);
    return NextResponse.json(po, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

// Convenience endpoint: given a jobId, returns the best (ranked)
// current quote for it — the UI can call this to help a dispatcher
// decide before actually creating the PO.
export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json({ error: "jobId query param is required" }, { status: 400 });
    }
    const bestQuote = await compareQuotesForJob(jobId);
    return NextResponse.json({ bestQuote });
  } catch (err) {
    return handleApiError(err);
  }
}
