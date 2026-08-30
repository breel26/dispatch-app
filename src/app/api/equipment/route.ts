import { NextRequest, NextResponse } from "next/server";
import { createEquipment, listEquipment } from "@/modules/inventory/repository";
import { handleApiError } from "@/modules/shared/apiError";
import type { Equipment } from "@prisma/client";

export async function GET(request: NextRequest) {
  try {
    const status = request.nextUrl.searchParams.get("status") as Equipment["status"] | null;
    const equipment = await listEquipment(status ?? undefined);
    return NextResponse.json(equipment);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const equipment = await createEquipment(body);
    return NextResponse.json(equipment, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
