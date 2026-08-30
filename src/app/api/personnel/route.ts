import { NextRequest, NextResponse } from "next/server";
import { createPersonnel, listPersonnel } from "@/modules/inventory/repository";
import { handleApiError } from "@/modules/shared/apiError";

export async function GET(request: NextRequest) {
  try {
    const activeOnlyParam = request.nextUrl.searchParams.get("activeOnly");
    const activeOnly = activeOnlyParam === null ? true : activeOnlyParam === "true";
    const personnel = await listPersonnel(activeOnly);
    return NextResponse.json(personnel);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const personnel = await createPersonnel(body);
    return NextResponse.json(personnel, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
