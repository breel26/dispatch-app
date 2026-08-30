import { NextRequest, NextResponse } from "next/server";
import { getEquipmentById, updateEquipment } from "@/modules/inventory/repository";
import { handleApiError } from "@/modules/shared/apiError";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const equipment = await getEquipmentById(id);
    if (!equipment) {
      return NextResponse.json({ error: "Equipment not found" }, { status: 404 });
    }
    return NextResponse.json(equipment);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const equipment = await updateEquipment(id, body);
    return NextResponse.json(equipment);
  } catch (err) {
    return handleApiError(err);
  }
}
