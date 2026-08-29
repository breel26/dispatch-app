import { NextRequest, NextResponse } from "next/server";
import { createMaterial, listMaterials } from "@/modules/inventory/repository";
import { findLowStockMaterials } from "@/modules/inventory/stockLevels";
import { handleApiError } from "@/modules/shared/apiError";

export async function GET(request: NextRequest) {
  try {
    const materials = await listMaterials();
    const lowStockOnly = request.nextUrl.searchParams.get("lowStock") === "true";
    if (lowStockOnly) {
      return NextResponse.json(findLowStockMaterials(materials));
    }
    return NextResponse.json(materials);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const material = await createMaterial(body);
    return NextResponse.json(material, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
