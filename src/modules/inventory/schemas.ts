import { z } from "zod";
import { CRAFT_VALUES, CLASSIFICATION_VALUES } from "./craft";
import { normalizeEmployeeIdInput } from "./employeeId";

// --- Personnel ---

// Employee numbers are normalized here rather than at the call site, so
// every write path stores the canonical padded form and "1" can never be
// filed as a different worker from "000001". Rejects anything that is not
// an employee number instead of coercing it.
const employeeIdSchema = z.string().transform((value, ctx): string => {
  const normalized = normalizeEmployeeIdInput(value);
  if (normalized === null) {
    ctx.addIssue({
      code: "custom",
      message: "employee id must be a number, e.g. 000001",
    });
    return z.NEVER;
  }
  return normalized;
});

// craft and classification replaced a single free-text `role`, which had
// been carrying both facts at once ("JM Carpenter"). Building the enums
// from the same tuples the dropdowns render means a trade can never be
// selectable in the UI but rejected here.
export const createPersonnelSchema = z.object({
  employeeId: employeeIdSchema,
  name: z.string().min(1, "name is required"),
  craft: z.enum(CRAFT_VALUES, { message: "select a craft" }),
  classification: z.enum(CLASSIFICATION_VALUES, { message: "select a classification" }),
  certifications: z.array(z.string().min(1)).default([]),
  isActive: z.boolean().default(true),
});
export type CreatePersonnelInput = z.infer<typeof createPersonnelSchema>;

export const updatePersonnelSchema = z.object({
  employeeId: employeeIdSchema.optional(),
  name: z.string().min(1).optional(),
  craft: z.enum(CRAFT_VALUES, { message: "select a craft" }).optional(),
  classification: z
    .enum(CLASSIFICATION_VALUES, { message: "select a classification" })
    .optional(),
  certifications: z.array(z.string().min(1)).optional(),
  isActive: z.boolean().optional(),
});
export type UpdatePersonnelInput = z.infer<typeof updatePersonnelSchema>;

// --- Material ---

export const createMaterialSchema = z.object({
  sku: z.string().min(1, "sku is required"),
  name: z.string().min(1, "name is required"),
  unit: z.string().min(1, "unit is required"),
  quantityOnHand: z.number().nonnegative().default(0),
  reorderThreshold: z.number().nonnegative().optional(),
});
export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;

// quantityOnHand is deliberately absent. Stock is a rollup of the
// StockMovement ledger, so setting it directly would make the number
// unexplainable - there would be no movement row saying where the change
// came from. Stock changes go through adjustMaterialQuantity, which
// records a reason. See modules/inventory/ledger.ts.
export const updateMaterialSchema = z.object({
  name: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  reorderThreshold: z.number().nonnegative().nullable().optional(),
});
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;

// Adjusting stock (receiving a delivery, consuming on a job) is modeled
// as a signed delta rather than the caller recomputing and setting an
// absolute quantityOnHand — that avoids a whole class of bugs where two
// concurrent adjustments silently overwrite each other. See
// repository.ts's adjustMaterialQuantity, which applies this atomically
// via a DB-level increment rather than read-modify-write in app code.
export const adjustMaterialQuantitySchema = z.object({
  materialId: z.string().min(1),
  delta: z.number().refine((n) => n !== 0, "delta cannot be zero"),
  reason: z.string().min(1, "reason is required for an audit trail"),
});
export type AdjustMaterialQuantityInput = z.infer<typeof adjustMaterialQuantitySchema>;

// --- Equipment ---

export const equipmentStatusValues = [
  "AVAILABLE",
  "ASSIGNED",
  "MAINTENANCE",
  "OUT_OF_SERVICE",
] as const;

export const createEquipmentSchema = z.object({
  name: z.string().min(1, "name is required"),
  type: z.string().min(1, "type is required"),
  status: z.enum(equipmentStatusValues).default("AVAILABLE"),
  location: z.string().optional(),
});
export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;

export const updateEquipmentSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  status: z.enum(equipmentStatusValues).optional(),
  location: z.string().optional(),
});
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>;
