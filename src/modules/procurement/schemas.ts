import { z } from "zod";

export const quoteRequestItemSchema = z.object({
  materialId: z.string().optional(),
  equipmentId: z.string().optional(),
  quantity: z.number().positive("quantity must be greater than 0"),
}).refine(
  (item) => (item.materialId ? 1 : 0) + (item.equipmentId ? 1 : 0) === 1,
  { message: "exactly one of materialId or equipmentId must be set" }
);

export const createQuoteRequestSchema = z.object({
  jobId: z.string().min(1, "jobId is required"),
  vendorId: z.string().min(1, "vendorId is required"),
  items: z.array(quoteRequestItemSchema).min(1, "at least one item is required"),
});

export type CreateQuoteRequestInput = z.infer<typeof createQuoteRequestSchema>;

export const createQuoteSchema = z.object({
  quoteRequestId: z.string().min(1),
  vendorId: z.string().min(1),
  materialId: z.string().optional(),
  equipmentId: z.string().optional(),
  price: z.number().nonnegative("price cannot be negative"),
  leadTimeDays: z.number().int().nonnegative().optional(),
  expiresAt: z.coerce.date().optional(),
}).refine(
  (q) => (q.materialId ? 1 : 0) + (q.equipmentId ? 1 : 0) === 1,
  { message: "exactly one of materialId or equipmentId must be set" }
);

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

export const createPurchaseOrderLineItemSchema = z.object({
  materialId: z.string().optional(),
  equipmentId: z.string().optional(),
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
}).refine(
  (item) => (item.materialId ? 1 : 0) + (item.equipmentId ? 1 : 0) === 1,
  { message: "exactly one of materialId or equipmentId must be set" }
);

export const createPurchaseOrderSchema = z.object({
  jobId: z.string().min(1),
  vendorId: z.string().min(1),
  quoteId: z.string().optional(),
  lineItems: z.array(createPurchaseOrderLineItemSchema).min(1, "at least one line item is required"),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
