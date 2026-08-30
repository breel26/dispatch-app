"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createQuoteRequest,
  recordQuote,
  createPurchaseOrder,
  issuePurchaseOrder,
  getPurchaseOrderByNumber,
} from "@/modules/procurement/repository";
import { sendQuoteRequest } from "@/modules/procurement/sendQuoteRequest";
import { normalizePoNumberInput } from "@/modules/procurement/poNumber";
import { toActionErrorMessage } from "@/modules/shared/actionError";
import { requireAuthContext } from "@/modules/shared/currentUser";
import { assertCan } from "@/modules/shared/authContext";
import { parseMoneyInput } from "@/modules/shared/money";

export interface ActionState {
  error?: string;
}

// See the note in jobs/actions.ts on why requireAuthContext() goes inside
// the try block and redirect() stays outside it.

function emptyToUndefined(value: FormDataEntryValue | null): string | undefined {
  if (value === null) return undefined;
  const str = value.toString();
  return str === "" ? undefined : str;
}

// Dynamic item/line-item rows are submitted as itemType_<key>,
// itemResourceId_<key>, itemQuantity_<key>, ... (see
// QuoteRequestForm/PurchaseOrderForm) rather than FormData's native array
// syntax, since browsers don't nest FormData keys. <key> is a React key
// from an ever-incrementing counter (stable across add/remove), not a
// sequential 0-based index — rows can be removed, so the set of keys
// actually present has to be discovered rather than counted from 0.
function collectRows(formData: FormData, prefix: string): Map<string, FormDataEntryValue>[] {
  const typeKeyPattern = new RegExp(`^${prefix}Type_(.+)$`);
  const keys = new Set<string>();
  for (const key of formData.keys()) {
    const match = key.match(typeKeyPattern);
    if (match) keys.add(match[1]);
  }

  return Array.from(keys).map((rowKey) => {
    const row = new Map<string, FormDataEntryValue>();
    const suffix = `_${rowKey}`;
    for (const [key, value] of formData.entries()) {
      if (key.startsWith(prefix) && key.endsWith(suffix)) {
        row.set(key.slice(0, -suffix.length), value);
      }
    }
    return row;
  });
}

// Splits an item key ("MATERIAL:abc123") back into the pair of optional
// ids the schemas expect. Used wherever a form identifies which requested
// item a row refers to.
function resourceIdsFromItemKey(itemKey: string): {
  materialId?: string;
  equipmentId?: string;
} {
  const separator = itemKey.indexOf(":");
  const type = itemKey.slice(0, separator);
  const id = itemKey.slice(separator + 1);
  return {
    materialId: type === "MATERIAL" ? id : undefined,
    equipmentId: type === "EQUIPMENT" ? id : undefined,
  };
}

// --- Quote Requests ---

export async function createQuoteRequestAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const jobId = formData.get("jobId")?.toString();
  const vendorId = formData.get("vendorId")?.toString();
  if (!jobId || !vendorId) {
    return { error: "job and vendor are required" };
  }

  const rows = collectRows(formData, "item");
  const items = rows.map((row) => {
    const type = row.get("itemType")?.toString();
    const resourceId = row.get("itemResourceId")?.toString();
    const quantity = Number(row.get("itemQuantity")?.toString() ?? "0");
    return {
      materialId: type === "MATERIAL" ? resourceId : undefined,
      equipmentId: type === "EQUIPMENT" ? resourceId : undefined,
      quantity,
    };
  });

  if (items.length === 0) {
    return { error: "at least one item is required" };
  }

  let quoteRequest;
  try {
    const ctx = await requireAuthContext();
    quoteRequest = await createQuoteRequest(ctx.orgId, { jobId, vendorId, items });
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath("/procurement/quote-requests");
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/procurement/quote-requests/${quoteRequest.id}`);
}

// Emails the quote request to the vendor, then marks it SENT. This
// previously only flipped the status without sending anything, so the
// UI reported "SENT" for requests no vendor ever received. If the send
// fails the request stays DRAFT and the error is shown inline, rather
// than silently leaving a request that looks sent but isn't.
export async function sendQuoteRequestAction(quoteRequestId: string): Promise<ActionState> {
  try {
    const ctx = await requireAuthContext();
    await sendQuoteRequest(ctx.orgId, quoteRequestId);
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath(`/procurement/quote-requests/${quoteRequestId}`);
  revalidatePath("/procurement/quote-requests");
  return {};
}

// Records a vendor's response across every line it priced.
//
// The form renders one row per requested item, named by that item's key,
// so the shape of the quote follows the shape of the request. Leaving a
// row's price blank means the vendor did not quote that item - a normal
// outcome worth distinguishing from a price of zero, which is why blank
// rows are skipped rather than coerced to 0.
export async function createQuoteAction(
  quoteRequestId: string,
  vendorId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const lineItems: {
    materialId?: string;
    equipmentId?: string;
    quantity: number;
    unitPrice: string;
    leadTimeDays?: number;
  }[] = [];

  for (const [field, value] of formData.entries()) {
    if (!field.startsWith("unitPrice_")) continue;

    const itemKey = field.slice("unitPrice_".length);
    const rawPrice = value.toString().trim();
    if (rawPrice === "") continue; // not quoted by this vendor

    if (parseMoneyInput(rawPrice) === null) {
      return { error: `"${rawPrice}" is not a valid price` };
    }

    const quantityRaw = formData.get(`quantity_${itemKey}`)?.toString();
    const quantity = Number(quantityRaw ?? "0");
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { error: "Each quoted line needs a quantity greater than zero" };
    }

    const leadTimeRaw = emptyToUndefined(formData.get(`leadTimeDays_${itemKey}`));

    lineItems.push({
      ...resourceIdsFromItemKey(itemKey),
      quantity,
      unitPrice: rawPrice,
      leadTimeDays: leadTimeRaw ? Number(leadTimeRaw) : undefined,
    });
  }

  if (lineItems.length === 0) {
    return { error: "Enter a price for at least one item" };
  }

  const headerLeadTime = emptyToUndefined(formData.get("leadTimeDays"));
  const expiresAtRaw = emptyToUndefined(formData.get("expiresAt"));

  try {
    const ctx = await requireAuthContext();
    await recordQuote(ctx.orgId, {
      quoteRequestId,
      vendorId,
      leadTimeDays: headerLeadTime ? Number(headerLeadTime) : undefined,
      expiresAt: expiresAtRaw ? new Date(expiresAtRaw) : undefined,
      notes: emptyToUndefined(formData.get("notes")),
      lineItems,
    });
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath(`/procurement/quote-requests/${quoteRequestId}`);
  revalidatePath("/procurement/quote-requests");
  return {};
}

// --- Purchase Orders ---

export async function createPurchaseOrderAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const jobId = formData.get("jobId")?.toString();
  const vendorId = formData.get("vendorId")?.toString();
  if (!jobId || !vendorId) {
    return { error: "job and vendor are required" };
  }
  const quoteId = emptyToUndefined(formData.get("quoteId"));

  const rows = collectRows(formData, "line");
  const lineItems: {
    materialId?: string;
    equipmentId?: string;
    quantity: number;
    unitPrice: string;
  }[] = [];

  for (const row of rows) {
    const type = row.get("lineType")?.toString();
    const resourceId = row.get("lineResourceId")?.toString();
    const rawPrice = row.get("lineUnitPrice")?.toString()?.trim() ?? "";

    // Prices stay as strings all the way into Zod, which converts them to
    // Decimal. Routing them through Number() first would reintroduce the
    // float imprecision the Decimal columns exist to prevent.
    if (parseMoneyInput(rawPrice) === null) {
      return { error: `"${rawPrice}" is not a valid unit price` };
    }

    lineItems.push({
      materialId: type === "MATERIAL" ? resourceId : undefined,
      equipmentId: type === "EQUIPMENT" ? resourceId : undefined,
      quantity: Number(row.get("lineQuantity")?.toString() ?? "0"),
      unitPrice: rawPrice,
    });
  }

  if (lineItems.length === 0) {
    return { error: "at least one line item is required" };
  }

  let po;
  try {
    const ctx = await requireAuthContext();
    po = await createPurchaseOrder(ctx.orgId, { jobId, vendorId, quoteId, lineItems });
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath("/procurement/purchase-orders");
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/procurement/purchase-orders/${po.id}`);
}

// Jumps straight to a purchase order given the number printed on it.
// Three outcomes the dispatcher needs told apart: the input isn't a PO
// number at all, it is one but no such PO exists, or it resolves — only
// the last one navigates. The redirect stays outside the try/catch on
// purpose: Next's redirect() signals by throwing, so catching it here
// would swallow the navigation and report it as a lookup failure.
export async function findPurchaseOrderAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const raw = formData.get("poNumber")?.toString() ?? "";
  if (raw.trim() === "") {
    return { error: "Enter a PO number" };
  }

  const poNumber = normalizePoNumberInput(raw);
  if (!poNumber) {
    return { error: `"${raw.trim()}" is not a valid PO number (expected e.g. PO-000047 or 47)` };
  }

  let purchaseOrder;
  try {
    const ctx = await requireAuthContext();
    purchaseOrder = await getPurchaseOrderByNumber(ctx.orgId, poNumber);
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }

  if (!purchaseOrder) {
    return { error: `No purchase order found with number ${poNumber}` };
  }

  redirect(`/procurement/purchase-orders/${purchaseOrder.id}`);
}

// Issuing commits the company to spend money with a vendor, so it is
// admin-only.
export async function issuePurchaseOrderAction(purchaseOrderId: string): Promise<ActionState> {
  try {
    const ctx = await requireAuthContext();
    assertCan(ctx, "issuePurchaseOrder");
    await issuePurchaseOrder(ctx.orgId, purchaseOrderId);
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath(`/procurement/purchase-orders/${purchaseOrderId}`);
  revalidatePath("/procurement/purchase-orders");
  return {};
}
