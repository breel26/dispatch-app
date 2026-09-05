import { z } from "zod";
import { CRAFT_VALUES, CLASSIFICATION_VALUES } from "./craft";
import { normalizeEmployeeIdInput } from "./employeeId";
import { normalizeEquipmentNumberInput } from "./equipmentNumber";

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

// SSN and driver's license number are validated here as plain strings -
// this schema's job is format, not storage. The repository encrypts the
// validated value with modules/shared/pii.ts before it reaches
// ssnEncrypted / driversLicenseNumberEncrypted; nothing here ever touches
// a Buffer, and no encrypted bytes are constructed from user input by
// anything other than the repository.
const ssnSchema = z
  .string()
  .regex(/^\d{3}-\d{2}-\d{4}$/, "ssn must be formatted XXX-XX-XXXX");
const driversLicenseNumberSchema = z
  .string()
  .min(1, "driver's license number is required");
const phoneNumberSchema = z
  .string()
  .regex(/^\(\d{3}\) \d{3}-\d{4}$/, "phone number must be formatted (XXX) XXX-XXXX");

// Flat fields matching the flat homeStreet1/homeCity/... columns on
// Personnel, rather than a nested address object - the DB has no nested
// address table, so a nested Zod shape would just need unwrapping again
// before the Prisma write.
const homeStreet1Schema = z.string().min(1, "street address is required");
const homeStreet2Schema = z.string().optional();
const homeCitySchema = z.string().min(1, "city is required");
const homeStateSchema = z
  .string()
  .length(2, "state must be a 2-letter abbreviation")
  .transform((s) => s.toUpperCase());
const homePostalCodeSchema = z
  .string()
  .regex(/^\d{5}(-\d{4})?$/, "postal code must be formatted 12345 or 12345-6789");

// craft and classification replaced a single free-text role field, which
// had been carrying both facts at once (a trade plus a classification
// abbreviation squeezed into one string). Building the enums from the
// same tuples the dropdowns render means a trade can never be selectable
// in the UI but rejected here.
export const createPersonnelSchema = z.object({
  employeeId: employeeIdSchema,

  firstName: z.string().min(1, "first name is required"),
  middleName: z.string().optional(),
  lastName: z.string().min(1, "last name is required"),

  dateOfBirth: z.coerce.date(),
  hireDate: z.coerce.date(),

  ssn: ssnSchema,
  driversLicenseNumber: driversLicenseNumberSchema,

  homeStreet1: homeStreet1Schema,
  homeStreet2: homeStreet2Schema,
  homeCity: homeCitySchema,
  homeState: homeStateSchema,
  homePostalCode: homePostalCodeSchema,
  homeCountry: z.string().min(1).default("US"),

  phoneNumber: phoneNumberSchema,

  craft: z.enum(CRAFT_VALUES, { message: "select a craft" }),
  classification: z.enum(CLASSIFICATION_VALUES, { message: "select a classification" }),
  certifications: z.array(z.string().min(1)).default([]),
  isActive: z.boolean().default(true),
});
export type CreatePersonnelInput = z.infer<typeof createPersonnelSchema>;

// Every HR field is optional on update, including ssn and
// driversLicenseNumber - a blank field on the edit form means "leave the
// encrypted value as it is", not "clear it". The action layer maps an
// empty form field to undefined before this runs (the same
// emptyToUndefined convention already used for every other optional field
// in this app), so "leave unchanged" and "submitted empty" collapse to
// the same thing rather than needing a separate sentinel.
export const updatePersonnelSchema = z.object({
  employeeId: employeeIdSchema.optional(),

  firstName: z.string().min(1).optional(),
  middleName: z.string().optional(),
  lastName: z.string().min(1).optional(),

  dateOfBirth: z.coerce.date().optional(),
  hireDate: z.coerce.date().optional(),

  ssn: ssnSchema.optional(),
  driversLicenseNumber: driversLicenseNumberSchema.optional(),

  homeStreet1: homeStreet1Schema.optional(),
  homeStreet2: homeStreet2Schema,
  homeCity: homeCitySchema.optional(),
  homeState: homeStateSchema.optional(),
  homePostalCode: homePostalCodeSchema.optional(),
  homeCountry: z.string().min(1).optional(),

  phoneNumber: phoneNumberSchema.optional(),

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

// Normalized here for the same reason employeeId is: a fleet number
// people read off a painted stencil or a rental tag arrives however it
// was typed ("03070142", "03-07-0142"), and the canonical dashed form is
// what gets stored, so the same equipment can never be filed under two
// different-looking numbers.
const equipmentNumberSchema = z.string().transform((value, ctx): string => {
  const normalized = normalizeEquipmentNumberInput(value);
  if (normalized === null) {
    ctx.addIssue({
      code: "custom",
      message: "equipment number must be formatted XX-XX-XXXX with a registered type and capacity code",
    });
    return z.NEVER;
  }
  return normalized;
});

export const createEquipmentSchema = z.object({
  equipmentNumber: equipmentNumberSchema,
  name: z.string().min(1, "name is required"),
  type: z.string().min(1, "type is required"),
  make: z.string().min(1, "make is required"),
  model: z.string().min(1, "model is required"),
  // Defaults to 0 here because it is actually true for equipment that is
  // genuinely brand new - unlike the migration backfill for equipment
  // already in service, which deliberately left this null rather than
  // claim a false 0. See the note on Equipment.operatingHours in
  // schema.prisma.
  operatingHours: z.number().nonnegative().default(0),
  requiredCertifications: z.array(z.string().min(1)).default([]),
  status: z.enum(equipmentStatusValues).default("AVAILABLE"),
  location: z.string().optional(),
});
export type CreateEquipmentInput = z.infer<typeof createEquipmentSchema>;

export const updateEquipmentSchema = z.object({
  equipmentNumber: equipmentNumberSchema.optional(),
  name: z.string().min(1).optional(),
  type: z.string().min(1).optional(),
  make: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  operatingHours: z.number().nonnegative().optional(),
  requiredCertifications: z.array(z.string().min(1)).optional(),
  status: z.enum(equipmentStatusValues).optional(),
  location: z.string().optional(),
});
export type UpdateEquipmentInput = z.infer<typeof updateEquipmentSchema>;
