"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createQuoteRequest,
  recordQuote,
  createPurchaseOrder,
  issuePurchaseOrder,
} from "@/modules/procurement/repository";
import { sendQuoteRequest } from "@/modules/procurement/sendQuoteRequest";
import { toActionErrorMessage } from "@/modules/shared/actionError";

export interface ActionState {
  error?: string;
}

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
    quoteRequest = await createQuoteRequest({ jobId, vendorId, items });
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
    await sendQuoteRequest(quoteRequestId);
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath(`/procurement/quote-requests/${quoteRequestId}`);
  revalidatePath("/procurement/quote-requests");
  return {};
}

// A QuoteRequest can list several items, but Quote has a single
// (materialId | equipmentId) — the schema models "the vendor's price for
// this one item," not a blanket total across the whole request. The form
// lets the dispatcher pick which item the recorded price is for.
export async function createQuoteAction(
  quoteRequestId: string,
  vendorId: string,
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const priceRaw = formData.get("price")?.toString();
  const itemKey = formData.get("itemKey")?.toString();
  if (!priceRaw || !itemKey) {
    return { error: "price and item are required" };
  }
  const [itemType, itemResourceId] = itemKey.split(":");
  const leadTimeRaw = emptyToUndefined(formData.get("leadTimeDays"));
  const expiresAtRaw = emptyToUndefined(formData.get("expiresAt"));

  try {
    await recordQuote({
      quoteRequestId,
      vendorId,
      materialId: itemType === "MATERIAL" ? itemResourceId : undefined,
      equipmentId: itemType === "EQUIPMENT" ? itemResourceId : undefined,
      price: Number(priceRaw),
      leadTimeDays: leadTimeRaw ? Number(leadTimeRaw) : undefined,
      expiresAt: expiresAtRaw ? new Date(expiresAtRaw) : undefined,
    });
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath(`/procurement/quote-requests/${quoteRequestId}`);
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
  const lineItems = rows.map((row) => {
    const type = row.get("lineType")?.toString();
    const resourceId = row.get("lineResourceId")?.toString();
    return {
      materialId: type === "MATERIAL" ? resourceId : undefined,
      equipmentId: type === "EQUIPMENT" ? resourceId : undefined,
      quantity: Number(row.get("lineQuantity")?.toString() ?? "0"),
      unitPrice: Number(row.get("lineUnitPrice")?.toString() ?? "0"),
    };
  });

  if (lineItems.length === 0) {
    return { error: "at least one line item is required" };
  }

  let po;
  try {
    po = await createPurchaseOrder({ jobId, vendorId, quoteId, lineItems });
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath("/procurement/purchase-orders");
  revalidatePath(`/jobs/${jobId}`);
  redirect(`/procurement/purchase-orders/${po.id}`);
}

export async function issuePurchaseOrderAction(purchaseOrderId: string): Promise<ActionState> {
  try {
    await issuePurchaseOrder(purchaseOrderId);
  } catch (err) {
    return { error: toActionErrorMessage(err) };
  }
  revalidatePath(`/procurement/purchase-orders/${purchaseOrderId}`);
  revalidatePath("/procurement/purchase-orders");
  return {};
}
