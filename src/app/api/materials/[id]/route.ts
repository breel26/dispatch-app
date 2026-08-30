import { NextRequest, NextResponse } from "next/server";
import { getMaterialById, updateMaterial } from "@/modules/inventory/repository";
import { handleApiError } from "@/modules/shared/apiError";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const material = await getMaterialById(id);
    if (!material) {
      return NextResponse.json({ error: "Material not found" }, { status: 404 });
    }
    return NextResponse.json(material);
  } catch (err) {
    return handleApiError(err);
  }
}

// updateMaterialSchema technically still allows quantityOnHand here, but
// the dashboard's edit form intentionally omits that field — quantity
// changes should go through /materials/[id]/adjust instead, so the
// required "reason" audit-trail field can't be silently bypassed.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const material = await updateMaterial(id, body);
    return NextResponse.json(material);
  } catch (err) {
    return handleApiError(err);
  }
}
