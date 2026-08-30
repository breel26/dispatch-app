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
import {
  itemKeyFor,
  summarizeJobQuotes,
  type JobQuoteSummary,
  type QuotedLine,
} from "./compareQuotes";

// A vendor priced something it was never asked about, or left a requested
// item unpriced. Both mean the quote and the request have drifted apart,
// which makes comparison meaningless - better to refuse the quote than to
// compare a line nobody requested.
export class QuoteItemMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteItemMismatchError";
  }
}

// Draws the next PO number from a real Postgres sequence.
//
// This replaced a single-row counter table that had to be seeded before
// the first PO could be created (a missing seed row threw P2025), and that
// serialized every concurrent PO insert behind one row lock. nextval() is
// atomic, lock-free, and needs no seeding.
//
// The tradeoff, deliberately accepted: a sequence is NOT rolled back by a
// failed transaction, so a PO whose insert fails burns its number. Gaps in
// PO numbers were already expected and are harmless - a dispatcher never
// needs PO numbers to be contiguous, only unique and stable.
export async function nextPoNumber(): Promise<string> {
  const rows = await prisma.$queryRaw<{ nextval: bigint }[]>`
    SELECT nextval('purchase_order_number_seq')
  `;
  const value = rows[0]?.nextval;
  if (value == null) {
    throw new Error("purchase_order_number_seq returned no value");
  }
  return formatPoNumber(Number(value));
}

// --- Quote requests ---

export async function createQuoteRequest(
  orgId: string,
  input: CreateQuoteRequestInput
): Promise<QuoteRequest> {
  const data = createQuoteRequestSchema.parse(input);

  // Confirms the job and vendor belong to this org before writing a row
  // that references them - otherwise a caller supplying another tenant's
  // id would create a cross-tenant link.
  const [job, vendor] = await Promise.all([
    prisma.job.findFirst({ where: { id: data.jobId, orgId }, select: { id: true } }),
    prisma.vendor.findFirst({ where: { id: data.vendorId, orgId }, select: { id: true } }),
  ]);
  if (!job || !vendor) {
    throw Object.assign(new Error("Job or vendor not found"), { code: "P2025" });
  }

  return prisma.quoteRequest.create({
    data: {
      orgId,
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

export async function markQuoteRequestSent(orgId: string, id: string): Promise<QuoteRequest> {
  return prisma.quoteRequest.update({
    where: { id, orgId },
    data: { status: "SENT", sentAt: new Date() },
  });
}

const quoteRequestInclude = {
  items: { include: { material: true, equipment: true } },
  vendor: true,
  quote: { include: { lineItems: { include: { material: true, equipment: true } } } },
} as const;

export async function listQuoteRequestsForJob(orgId: string, jobId: string) {
  return prisma.quoteRequest.findMany({
    where: { orgId, jobId },
    include: quoteRequestInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function listQuoteRequests(orgId: string) {
  return prisma.quoteRequest.findMany({
    where: { orgId },
    include: quoteRequestInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function getQuoteRequestById(orgId: string, id: string) {
  return prisma.quoteRequest.findFirst({
    where: { id, orgId },
    include: { ...quoteRequestInclude, job: true },
  });
}

// --- Quotes ---

// Records a vendor's response: every line it priced, in one transaction
// with the status change.
//
// Each quoted line must correspond to a line that was actually requested.
// Without that check a vendor's quote could price items nobody asked for,
// and the per-item comparison would be ranking lines that have no
// counterpart from any other vendor.
export async function recordQuote(orgId: string, input: CreateQuoteInput): Promise<Quote> {
  const data = createQuoteSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    const request = await tx.quoteRequest.findFirst({
      where: { id: data.quoteRequestId, orgId },
      include: { items: true },
    });
    if (!request) {
      throw Object.assign(new Error("Quote request not found"), { code: "P2025" });
    }
    if (request.vendorId !== data.vendorId) {
      throw new QuoteItemMismatchError(
        "This quote is attributed to a different vendor than the request was sent to"
      );
    }

    const requestedKeys = new Set(
      request.items.map((item) => itemKeyFor(item.materialId, item.equipmentId))
    );
    const quotedKeys = new Set<string>();

    for (const line of data.lineItems) {
      const key = itemKeyFor(line.materialId, line.equipmentId);
      if (!requestedKeys.has(key)) {
        throw new QuoteItemMismatchError(
          "The quote prices an item that was not part of this request"
        );
      }
      if (quotedKeys.has(key)) {
        throw new QuoteItemMismatchError("The quote prices the same item twice");
      }
      quotedKeys.add(key);
    }

    const quote = await tx.quote.create({
      data: {
        orgId,
        quoteRequestId: data.quoteRequestId,
        vendorId: data.vendorId,
        leadTimeDays: data.leadTimeDays,
        expiresAt: data.expiresAt,
        notes: data.notes,
        lineItems: {
          create: data.lineItems.map((line) => ({
            materialId: line.materialId,
            equipmentId: line.equipmentId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            leadTimeDays: line.leadTimeDays,
          })),
        },
      },
    });

    await tx.quoteRequest.update({
      where: { id: data.quoteRequestId, orgId },
      data: { status: "RESPONDED" },
    });

    return quote;
  });
}

function labelForResource(
  material: { name: string; unit: string } | null,
  equipment: { name: string } | null
): string {
  if (material) return material.name;
  if (equipment) return equipment.name;
  return "Unknown item";
}

// Every vendor line quoted for a job, grouped by item and ranked within
// each group. See compareQuotes.ts for why comparison is per-item rather
// than one ranking across the whole job.
export async function compareQuotesForJob(
  orgId: string,
  jobId: string
): Promise<JobQuoteSummary> {
  const quotes = await prisma.quote.findMany({
    where: { orgId, quoteRequest: { jobId } },
    include: {
      vendor: true,
      lineItems: { include: { material: true, equipment: true } },
    },
  });

  const lines: QuotedLine[] = quotes.flatMap((quote) =>
    quote.lineItems.map((line) => ({
      quoteId: quote.id,
      vendorId: quote.vendorId,
      vendorName: quote.vendor.name,
      itemKey: itemKeyFor(line.materialId, line.equipmentId),
      itemLabel: labelForResource(line.material, line.equipment),
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      // A line's own lead time wins over the quote's header default.
      leadTimeDays: line.leadTimeDays ?? quote.leadTimeDays,
      expiresAt: quote.expiresAt,
    }))
  );

  return summarizeJobQuotes(lines);
}

// --- Purchase orders ---

// Creates a PurchaseOrder with a freshly drawn PO number.
//
// The number comes from the sequence outside the transaction on purpose:
// nextval() is not transactional anyway, so holding it inside would create
// the false impression that a rollback returns the number.
export async function createPurchaseOrder(
  orgId: string,
  input: CreatePurchaseOrderInput
): Promise<PurchaseOrder> {
  const data = createPurchaseOrderSchema.parse(input);

  const [job, vendor] = await Promise.all([
    prisma.job.findFirst({ where: { id: data.jobId, orgId }, select: { id: true } }),
    prisma.vendor.findFirst({ where: { id: data.vendorId, orgId }, select: { id: true } }),
  ]);
  if (!job || !vendor) {
    throw Object.assign(new Error("Job or vendor not found"), { code: "P2025" });
  }

  if (data.quoteId) {
    const quote = await prisma.quote.findFirst({
      where: { id: data.quoteId, orgId },
      select: { id: true },
    });
    if (!quote) {
      throw Object.assign(new Error("Quote not found"), { code: "P2025" });
    }
  }

  const poNumber = await nextPoNumber();

  return prisma.purchaseOrder.create({
    data: {
      orgId,
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
}

export async function issuePurchaseOrder(orgId: string, id: string): Promise<PurchaseOrder> {
  return prisma.purchaseOrder.update({
    where: { id, orgId },
    data: { status: "ISSUED", issuedAt: new Date() },
  });
}

const purchaseOrderInclude = {
  lineItems: { include: { material: true, equipment: true } },
  vendor: true,
  job: true,
} as const;

export async function listPurchaseOrdersForJob(orgId: string, jobId: string) {
  return prisma.purchaseOrder.findMany({
    where: { orgId, jobId },
    include: purchaseOrderInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function listPurchaseOrders(orgId: string) {
  return prisma.purchaseOrder.findMany({
    where: { orgId },
    include: purchaseOrderInclude,
    orderBy: { createdAt: "desc" },
  });
}

export async function getPurchaseOrderById(orgId: string, id: string) {
  return prisma.purchaseOrder.findFirst({
    where: { id, orgId },
    include: { ...purchaseOrderInclude, quote: { include: { lineItems: true } } },
  });
}

// Looks a PO up by the number printed on it, rather than its internal cuid
// - the only identifier a dispatcher holding a paper order or a vendor
// email actually has. Expects an already-canonical PO number; run
// human-typed input through normalizePoNumberInput first.
//
// PO numbers are globally unique, so this deliberately uses findFirst with
// an orgId filter rather than findUnique on the number alone: a PO number
// must never resolve across a tenant boundary. Returns null when no PO in
// this org has that number.
export async function getPurchaseOrderByNumber(orgId: string, poNumber: string) {
  return prisma.purchaseOrder.findFirst({
    where: { poNumber, orgId },
    include: { ...purchaseOrderInclude, quote: { include: { lineItems: true } } },
  });
}
