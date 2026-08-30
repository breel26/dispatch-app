import { NextRequest, NextResponse } from "next/server";
import { getVendorById, updateVendor, deleteVendor } from "@/modules/vendors/repository";
import { handleApiError } from "@/modules/shared/apiError";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const vendor = await getVendorById(id);
    if (!vendor) {
      return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
    }
    return NextResponse.json(vendor);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    const vendor = await updateVendor(id, body);
    return NextResponse.json(vendor);
  } catch (err) {
    return handleApiError(err);
  }
}

// Hard delete — deleteVendor has no soft-delete flag yet, so this fails
// with a Prisma P2003 (mapped to a 409 by handleApiError) if the vendor
// has related QuoteRequests/Quotes/PurchaseOrders.
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const vendor = await deleteVendor(id);
    return NextResponse.json(vendor);
  } catch (err) {
    return handleApiError(err);
  }
}
