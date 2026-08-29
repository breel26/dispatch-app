import { z } from "zod";

// --- Personnel ---

export const createPersonnelSchema = z.object({
  name: z.string().min(1, "name is required"),
  role: z.string().min(1, "role is required"),
  certifications: z.array(z.string().min(1)).default([]),
  isActive: z.boolean().default(true),
});
export type CreatePersonnelInput = z.infer<typeof createPersonnelSchema>;

export const updatePersonnelSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.string().min(1).optional(),
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

export const updateMaterialSchema = z.object({
  name: z.string().min(1).optional(),
  unit: z.string().min(1).optional(),
  quantityOnHand: z.number().nonnegative().optional(),
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
