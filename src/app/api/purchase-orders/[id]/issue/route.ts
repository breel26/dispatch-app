import { NextRequest, NextResponse } from "next/server";
import { issuePurchaseOrder } from "@/modules/procurement/repository";
import { handleApiError } from "@/modules/shared/apiError";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const po = await issuePurchaseOrder(id);
    return NextResponse.json(po);
  } catch (err) {
    return handleApiError(err);
  }
}
