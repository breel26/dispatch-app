import { NextRequest, NextResponse } from "next/server";
import { adjustMaterialQuantity } from "@/modules/inventory/repository";
import { handleApiError } from "@/modules/shared/apiError";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Applies a signed delta (delivery received, consumed on a job, etc.)
// atomically — see adjustMaterialQuantity for why this is a delta rather
// than an absolute quantityOnHand write.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const material = await adjustMaterialQuantity({ ...body, materialId: id });
    return NextResponse.json(material);
  } catch (err) {
    return handleApiError(err);
  }
}
