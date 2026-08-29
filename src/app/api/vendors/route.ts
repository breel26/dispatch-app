import { NextRequest, NextResponse } from "next/server";
import { createVendor, listVendors, findVendorsByCategory } from "@/modules/vendors/repository";
import { handleApiError } from "@/modules/shared/apiError";

export async function GET(request: NextRequest) {
  try {
    const category = request.nextUrl.searchParams.get("category");
    const vendors = category ? await findVendorsByCategory(category) : await listVendors();
    return NextResponse.json(vendors);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const vendor = await createVendor(body);
    return NextResponse.json(vendor, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
