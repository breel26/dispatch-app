// NOTE ON VERIFICATION: same caveat as jobs/repository.ts and
// vendors/repository.ts — not typechecked or tested here, Prisma Client
// generation is network-blocked in this sandbox. The PO number
// generation transaction below is the single most safety-critical piece
// of Prisma code in this project (it's what guarantees PO numbers never
// collide under concurrent dispatchers) — do not treat this as verified
// just because it reads correctly. Write an actual concurrency
// integration test (two simultaneous calls to nextPoNumber against a
// real Postgres instance) before relying on this in production.

import { prisma } from "@/modules/shared/prisma";
import type { Quote, QuoteRequest, PurchaseOrder } from "@prisma/client";
import {
  createQuoteRequestSchema,
  createQuoteSchema,
  createPurchaseOrderSchema,
  type CreateQuoteRequestInput,
  type CreateQuoteInput,
  type CreatePurchaseOrderInput,
} from "./schemas";
import { formatPoNumber } from "./poNumber";
import { selectBestQuote, type ComparableQuote } from "./compareQuotes";

// Atomically increments PurchaseOrderSequence.lastPoNumber and returns
// the new value, formatted. Uses a single UPDATE ... RETURNING inside a
// transaction so two concurrent calls can never receive the same
// number — Postgres serializes the row-level update.
//
// CAUTION: calling this standalone permanently consumes a number even
// if no PurchaseOrder ends up using it (e.g. "PO-000047" gets skipped
// forever). That's fine — gaps in PO numbers are normal and harmless —
// but don't call this just to "preview" the next number; use it only
// when you're actually about to create the PO. createPurchaseOrder
// below does its own increment inside the same transaction as the PO
// insert for exactly this reason — prefer that over calling this
// function directly and passing the result in separately.
export async function nextPoNumber(): Promise<string> {
  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.purchaseOrderSequence.update({
      where: { id: 1 },
      data: { lastPoNumber: { increment: 1 } },
    });
    return updated.lastPoNumber;
  });
  return formatPoNumber(result);
}

export async function createQuoteRequest(
  input: CreateQuoteRequestInput
): Promise<QuoteRequest> {
  const data = createQuoteRequestSchema.parse(input);
  return prisma.quoteRequest.create({
    data: {
      jobId: data.jobId,
      vendorId: data.vendorId,
      items: {
        create: data.items.map((item) => ({
          materialId: item.materialId,
          equipmentId: item.equipmentId,
          quantity: item.quantity,
        })),
      },
    },
  });
}

export async function markQuoteRequestSent(id: string): Promise<QuoteRequest> {
  return prisma.quoteRequest.update({
    where: { id },
    data: { status: "SENT", sentAt: new Date() },
  });
}

export async function listQuoteRequestsForJob(jobId: string) {
  return prisma.quoteRequest.findMany({
    where: { jobId },
    include: { items: true, vendor: true, quote: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function listQuoteRequests() {
  return prisma.quoteRequest.findMany({
    include: { items: true, vendor: true, quote: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getQuoteRequestById(id: string) {
  return prisma.quoteRequest.findUnique({
    where: { id },
    include: { items: true, vendor: true, quote: true },
  });
}

export async function recordQuote(input: CreateQuoteInput): Promise<Quote> {
  const data = createQuoteSchema.parse(input);
  const quote = await prisma.quote.create({ data });
  await prisma.quoteRequest.update({
    where: { id: data.quoteRequestId },
    data: { status: "RESPONDED" },
  });
  return quote;
}

// Fetches all quotes attached to quote requests for a given job, and
// returns the ranked comparison — the actual point of collecting
// multiple vendor quotes in the first place.
export async function compareQuotesForJob(jobId: string) {
  const quotes = await prisma.quote.findMany({
    where: { quoteRequest: { jobId } },
    include: { vendor: true },
  });

  const comparable: ComparableQuote[] = quotes.map((q) => ({
    id: q.id,
    vendorId: q.vendorId,
    vendorName: q.vendor.name,
    price: q.price,
    leadTimeDays: q.leadTimeDays,
    expiresAt: q.expiresAt,
  }));

  return selectBestQuote(comparable);
}

// Creates a PurchaseOrder with a freshly generated PO number, inside a
// transaction so the number is never "burned" (incremented) without a
// PO actually being created to match it — if the PO insert fails, the
// whole transaction (including the sequence increment) rolls back.
export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput
): Promise<PurchaseOrder> {
  const data = createPurchaseOrderSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    const updatedSeq = await tx.purchaseOrderSequence.update({
      where: { id: 1 },
      data: { lastPoNumber: { increment: 1 } },
    });
    const poNumber = formatPoNumber(updatedSeq.lastPoNumber);

    return tx.purchaseOrder.create({
      data: {
        poNumber,
        jobId: data.jobId,
        vendorId: data.vendorId,
        quoteId: data.quoteId,
        lineItems: {
          create: data.lineItems.map((item) => ({
            materialId: item.materialId,
            equipmentId: item.equipmentId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          })),
        },
      },
    });
  });
}

export async function issuePurchaseOrder(id: string): Promise<PurchaseOrder> {
  return prisma.purchaseOrder.update({
    where: { id },
    data: { status: "ISSUED", issuedAt: new Date() },
  });
}

export async function listPurchaseOrdersForJob(jobId: string) {
  return prisma.purchaseOrder.findMany({
    where: { jobId },
    include: { lineItems: true, vendor: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function listPurchaseOrders() {
  return prisma.purchaseOrder.findMany({
    include: { lineItems: true, vendor: true, job: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPurchaseOrderById(id: string) {
  return prisma.purchaseOrder.findUnique({
    where: { id },
    include: { lineItems: true, vendor: true, job: true, quote: true },
  });
}

// Looks a PO up by the number printed on it, rather than its internal
// cuid — the only identifier a dispatcher holding a paper order or a
// vendor email actually has. Expects an already-canonical PO number;
// run human-typed input through normalizePoNumberInput first, since
// this matches the stored string exactly. Returns null when no PO has
// that number, so callers can say so rather than 404-ing.
export async function getPurchaseOrderByNumber(poNumber: string) {
  return prisma.purchaseOrder.findUnique({
    where: { poNumber },
    include: { lineItems: true, vendor: true, job: true, quote: true },
  });
}
