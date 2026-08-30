import { NextRequest, NextResponse } from "next/server";
import { getQuoteRequestById } from "@/modules/procurement/repository";
import { handleApiError } from "@/modules/shared/apiError";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const quoteRequest = await getQuoteRequestById(id);
    if (!quoteRequest) {
      return NextResponse.json({ error: "Quote request not found" }, { status: 404 });
    }
    return NextResponse.json(quoteRequest);
  } catch (err) {
    return handleApiError(err);
  }
}
