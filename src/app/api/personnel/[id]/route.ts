import { NextRequest, NextResponse } from "next/server";
import { getPersonnelById, updatePersonnel, deactivatePersonnel } from "@/modules/inventory/repository";
import { handleApiError } from "@/modules/shared/apiError";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const personnel = await getPersonnelById(id);
    if (!personnel) {
      return NextResponse.json({ error: "Personnel not found" }, { status: 404 });
    }
    return NextResponse.json(personnel);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const personnel = await updatePersonnel(id, body);
    return NextResponse.json(personnel);
  } catch (err) {
    return handleApiError(err);
  }
}

// Soft delete — deactivatePersonnel flips isActive rather than removing
// the row, since historical Assignments may still reference it.
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const personnel = await deactivatePersonnel(id);
    return NextResponse.json(personnel);
  } catch (err) {
    return handleApiError(err);
  }
}
