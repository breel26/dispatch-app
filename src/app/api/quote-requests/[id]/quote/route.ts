import { NextRequest, NextResponse } from "next/server";
import { recordQuote } from "@/modules/procurement/repository";
import { handleApiError } from "@/modules/shared/apiError";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Records a vendor's response to a quote request. Also flips the parent
// QuoteRequest's status to RESPONDED — see recordQuote in repository.ts.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const quote = await recordQuote({ ...body, quoteRequestId: id });
    return NextResponse.json(quote, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
