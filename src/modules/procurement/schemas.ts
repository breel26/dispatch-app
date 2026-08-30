import { z } from "zod";
import { money, parseMoneyInput, type Money } from "@/modules/shared/money";

// Money arrives from a form as a string and must end up as a Decimal, never
// as a JS number - routing it through `Number()` first would reintroduce
// exactly the float imprecision the Decimal columns exist to avoid. This
// accepts what a form or an API sends and produces a Decimal, rejecting
// anything that is not a price.
export const moneySchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx): Money => {
    const parsed = parseMoneyInput(typeof value === "number" ? value.toString() : value);
    if (parsed === null) {
      ctx.addIssue({ code: "custom", message: "must be a valid price" });
      return z.NEVER;
    }
    return parsed;
  })
  .refine((value) => !value.isNegative(), { message: "price cannot be negative" });

// --- Quote requests ---

export const quoteRequestItemSchema = z
  .object({
    materialId: z.string().optional(),
    equipmentId: z.string().optional(),
    quantity: z.number().positive("quantity must be greater than 0"),
  })
  .refine((item) => (item.materialId ? 1 : 0) + (item.equipmentId ? 1 : 0) === 1, {
    message: "exactly one of materialId or equipmentId must be set",
  });

export const createQuoteRequestSchema = z.object({
  jobId: z.string().min(1, "jobId is required"),
  vendorId: z.string().min(1, "vendorId is required"),
  items: z.array(quoteRequestItemSchema).min(1, "at least one item is required"),
});

export type CreateQuoteRequestInput = z.infer<typeof createQuoteRequestSchema>;

// --- Quotes ---

// One priced line of a vendor's response. A quote now carries as many of
// these as the request had items, instead of a single price that forced the
// UI to ask which item the number was for.
export const quoteLineItemSchema = z
  .object({
    materialId: z.string().optional(),
    equipmentId: z.string().optional(),
    quantity: z.number().positive("quantity must be greater than 0"),
    unitPrice: moneySchema,
    leadTimeDays: z.number().int().nonnegative().optional(),
  })
  .refine((item) => (item.materialId ? 1 : 0) + (item.equipmentId ? 1 : 0) === 1, {
    message: "exactly one of materialId or equipmentId must be set",
  });

export const createQuoteSchema = z.object({
  quoteRequestId: z.string().min(1),
  vendorId: z.string().min(1),
  leadTimeDays: z.number().int().nonnegative().optional(),
  expiresAt: z.coerce.date().optional(),
  notes: z.string().optional(),
  lineItems: z.array(quoteLineItemSchema).min(1, "a quote needs at least one priced line"),
});

// z.input, not z.infer: moneySchema transforms a string into a Decimal, so
// the type callers construct differs from the type the schema produces.
// Callers hand in what a form gives them (a string); parse() returns the
// Decimal that goes to the database.
export type CreateQuoteInput = z.input<typeof createQuoteSchema>;

// --- Purchase orders ---

export const createPurchaseOrderLineItemSchema = z
  .object({
    materialId: z.string().optional(),
    equipmentId: z.string().optional(),
    quantity: z.number().positive(),
    unitPrice: moneySchema,
  })
  .refine((item) => (item.materialId ? 1 : 0) + (item.equipmentId ? 1 : 0) === 1, {
    message: "exactly one of materialId or equipmentId must be set",
  });

export const createPurchaseOrderSchema = z.object({
  jobId: z.string().min(1),
  vendorId: z.string().min(1),
  quoteId: z.string().optional(),
  lineItems: z
    .array(createPurchaseOrderLineItemSchema)
    .min(1, "at least one line item is required"),
});

// z.input for the same reason as CreateQuoteInput above.
export type CreatePurchaseOrderInput = z.input<typeof createPurchaseOrderSchema>;

// Exported for tests and callers that need a Decimal without going through
// a schema.
export { money };
export type { Money };
