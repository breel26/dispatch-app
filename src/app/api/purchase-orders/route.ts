import { NextRequest, NextResponse } from "next/server";
import {
  createPurchaseOrder,
  compareQuotesForJob,
  getPurchaseOrderByNumber,
} from "@/modules/procurement/repository";
import { normalizePoNumberInput } from "@/modules/procurement/poNumber";
import { handleApiError } from "@/modules/shared/apiError";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const po = await createPurchaseOrder(body);
    return NextResponse.json(po, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

// Two lookups behind one endpoint, selected by query param:
//   ?poNumber=PO-000047 — fetch a purchase order by its printed number
//   ?jobId=<id>         — the best (ranked) current quote for that job,
//                         to help a dispatcher decide before creating a PO
export async function GET(request: NextRequest) {
  try {
    const poNumberParam = request.nextUrl.searchParams.get("poNumber");
    if (poNumberParam !== null) {
      // Same forgiving normalization the dashboard lookup uses, so an
      // external caller passing "47" gets the same answer as "PO-000047".
      const poNumber = normalizePoNumberInput(poNumberParam);
      if (!poNumber) {
        return NextResponse.json(
          { error: `"${poNumberParam}" is not a valid PO number` },
          { status: 400 }
        );
      }
      const purchaseOrder = await getPurchaseOrderByNumber(poNumber);
      if (!purchaseOrder) {
        return NextResponse.json(
          { error: `No purchase order found with number ${poNumber}` },
          { status: 404 }
        );
      }
      return NextResponse.json(purchaseOrder);
    }

    const jobId = request.nextUrl.searchParams.get("jobId");
    if (!jobId) {
      return NextResponse.json(
        { error: "poNumber or jobId query param is required" },
        { status: 400 }
      );
    }
    const bestQuote = await compareQuotesForJob(jobId);
    return NextResponse.json({ bestQuote });
  } catch (err) {
    return handleApiError(err);
  }
}
