import { prisma } from "@/modules/shared/prisma";
import type { Personnel, Material, Equipment } from "@prisma/client";
import {
  createPersonnelSchema, updatePersonnelSchema,
  createMaterialSchema, updateMaterialSchema, adjustMaterialQuantitySchema,
  createEquipmentSchema, updateEquipmentSchema,
  type CreatePersonnelInput, type UpdatePersonnelInput,
  type CreateMaterialInput, type UpdateMaterialInput, type AdjustMaterialQuantityInput,
  type CreateEquipmentInput, type UpdateEquipmentInput,
} from "./schemas";
import { applyStockDelta } from "./ledger";
import { encryptPii } from "@/modules/shared/pii";

// orgId is a required first argument on every function - see the note in
// jobs/repository.ts for why scoping is passed explicitly.

// --- Personnel ---

// Raised instead of letting the unique index produce a bare constraint
// error, so the dispatcher is told who already holds the number rather
// than just "that value is taken". Mirrors DuplicateJobNumberError in
// modules/jobs/repository.ts.
export class DuplicateEmployeeIdError extends Error {
  constructor(employeeId: string, existingName: string) {
    super(`Employee id ${employeeId} is already used by "${existingName}"`);
    this.name = "DuplicateEmployeeIdError";
  }
}

// ssnEncrypted and driversLicenseNumberEncrypted hold ciphertext plus an
// IV, not display data. Any code reading a Personnel row for a Server
// Component to hand off must not forward those two fields as a prop into
// a Client Component - Next would serialize the raw bytes into the
// page's RSC payload, shipping encrypted material and its IV to the
// browser for no reason. Decrypt (see modules/shared/pii.ts decryptPii)
// only in server-side code, and only render the resulting plaintext as
// text content, never as a component prop.

// The check runs against the NORMALIZED id from the parsed data, not the
// raw input - otherwise typing "1" would sail past a check for "000001"
// and only fail later at the index.
//
// The unique index remains the guarantee; this pre-check exists to name
// the conflict. A concurrent insert that slips past it still hits the
// index and classifies as "a record with this employeeId already exists".
async function assertEmployeeIdAvailable(
  orgId: string,
  employeeId: string,
  excludePersonnelId?: string
): Promise<void> {
  const existing = await prisma.personnel.findUnique({
    where: { orgId_employeeId: { orgId, employeeId } },
    select: { id: true, firstName: true, lastName: true },
  });
  if (existing && existing.id !== excludePersonnelId) {
    throw new DuplicateEmployeeIdError(employeeId, `${existing.firstName} ${existing.lastName}`);
  }
}

export async function createPersonnel(orgId: string, input: CreatePersonnelInput): Promise<Personnel> {
  const { ssn, driversLicenseNumber, ...rest } = createPersonnelSchema.parse(input);
  await assertEmployeeIdAvailable(orgId, rest.employeeId);
  return prisma.personnel.create({
    data: {
      ...rest,
      orgId,
      // Encrypted here, not in the schema - the schema only validates
      // format. This is the one place a plaintext ssn/driversLicenseNumber
      // is ever turned into the bytes that reach the database.
      ssnEncrypted: encryptPii(ssn),
      driversLicenseNumberEncrypted: encryptPii(driversLicenseNumber),
    },
  });
}

export async function listPersonnel(orgId: string, activeOnly = true): Promise<Personnel[]> {
  return prisma.personnel.findMany({
    where: { orgId, ...(activeOnly ? { isActive: true } : {}) },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });
}

export async function getPersonnelById(orgId: string, id: string): Promise<Personnel | null> {
  return prisma.personnel.findFirst({ where: { id, orgId } });
}

// Used by the Excel importer to decide whether an imported row is a new
// worker or an update to an existing one, the same role
// getMaterialBySku plays for materials.
export async function getPersonnelByEmployeeId(
  orgId: string,
  employeeId: string
): Promise<Personnel | null> {
  return prisma.personnel.findUnique({ where: { orgId_employeeId: { orgId, employeeId } } });
}

// Every employee number in use, with just enough of the worker's identity
// to say who holds one. Feeds the importer's clash review: it needs both
// "is this number taken" and "taken by whom", and a per-row lookup would
// be one query per spreadsheet row.
//
// Deliberately selects three columns and no more. Personnel rows carry
// encrypted SSN and driver license, and this result is summarized into
// something rendered in a Client Component - so the sensitive columns are
// never loaded in the first place, rather than loaded and then carefully
// not used.
export async function listEmployeeIdIndex(
  orgId: string
): Promise<{ employeeId: string; firstName: string; lastName: string }[]> {
  return prisma.personnel.findMany({
    where: { orgId },
    select: { employeeId: true, firstName: true, lastName: true },
  });
}

export async function updatePersonnel(
  orgId: string,
  id: string,
  input: UpdatePersonnelInput
): Promise<Personnel> {
  const { ssn, driversLicenseNumber, ...rest } = updatePersonnelSchema.parse(input);
  if (rest.employeeId !== undefined) {
    // Excludes this worker, so re-saving the edit form without changing
    // the number does not report a clash with themselves.
    await assertEmployeeIdAvailable(orgId, rest.employeeId, id);
  }
  return prisma.personnel.update({
    where: { id, orgId },
    data: {
      ...rest,
      // undefined means "field not submitted", and Prisma leaves an
      // undefined field untouched on update - this is what makes leaving
      // the SSN/license inputs blank on the edit form mean "keep the
      // existing encrypted value", not "clear it".
      ssnEncrypted: ssn !== undefined ? encryptPii(ssn) : undefined,
      driversLicenseNumberEncrypted:
        driversLicenseNumber !== undefined ? encryptPii(driversLicenseNumber) : undefined,
    },
  });
}

// Soft-delete, matching the Job/cancelJob pattern - a deactivated worker
// may still be referenced by historical Assignments.
export async function deactivatePersonnel(orgId: string, id: string): Promise<Personnel> {
  return prisma.personnel.update({ where: { id, orgId }, data: { isActive: false } });
}

// --- Material ---

// A new material's starting stock is recorded as an OPENING_BALANCE
// movement rather than just being written to quantityOnHand, so the ledger
// balances from the material's very first row. See ledger.ts.
export async function createMaterial(
  orgId: string,
  input: CreateMaterialInput,
  createdBy?: string
): Promise<Material> {
  const data = createMaterialSchema.parse(input);

  return prisma.$transaction(async (tx) => {
    const material = await tx.material.create({
      data: { ...data, orgId, quantityOnHand: 0 },
    });

    if (data.quantityOnHand === 0) return material;

    return applyStockDelta(tx, {
      orgId,
      materialId: material.id,
      delta: data.quantityOnHand,
      reason: "OPENING_BALANCE",
      note: "Starting quantity recorded when the material was created",
      createdBy,
    });
  });
}

export async function listMaterials(orgId: string): Promise<Material[]> {
  return prisma.material.findMany({ where: { orgId }, orderBy: { name: "asc" } });
}

export async function getMaterialBySku(orgId: string, sku: string): Promise<Material | null> {
  return prisma.material.findUnique({ where: { orgId_sku: { orgId, sku } } });
}

export async function getMaterialById(orgId: string, id: string): Promise<Material | null> {
  return prisma.material.findFirst({ where: { id, orgId } });
}

// Note the absence of quantityOnHand: stock is not editable through the
// generic update path, because that would bypass the ledger and leave the
// cached rollup unexplainable. Stock changes go through
// adjustMaterialQuantity. See updateMaterialSchema.
export async function updateMaterial(
  orgId: string,
  id: string,
  input: UpdateMaterialInput
): Promise<Material> {
  const data = updateMaterialSchema.parse(input);
  return prisma.material.update({ where: { id, orgId }, data });
}

// Applies a signed delta atomically, recording why in the stock ledger.
// The `reason` this takes was previously validated and then thrown away -
// it is now the audit trail it always claimed to be.
export async function adjustMaterialQuantity(
  orgId: string,
  input: AdjustMaterialQuantityInput,
  createdBy?: string
): Promise<Material> {
  const data = adjustMaterialQuantitySchema.parse(input);

  return prisma.$transaction(async (tx) => {
    return applyStockDelta(tx, {
      orgId,
      materialId: data.materialId,
      delta: data.delta,
      reason: "ADJUSTMENT",
      note: data.reason,
      createdBy,
    });
  });
}

// --- Equipment ---

// Mirrors DuplicateEmployeeIdError / DuplicateJobNumberError - names who
// already holds the number rather than surfacing a bare unique-constraint
// error. The check runs against the normalized number, so "03070142" is
// correctly caught as a clash with the stored "03-07-0142" instead of
// slipping past and failing later at the index.
export class DuplicateEquipmentNumberError extends Error {
  constructor(equipmentNumber: string, existingName: string) {
    super(`Equipment number ${equipmentNumber} is already used by "${existingName}"`);
    this.name = "DuplicateEquipmentNumberError";
  }
}

async function assertEquipmentNumberAvailable(
  orgId: string,
  equipmentNumber: string,
  excludeEquipmentId?: string
): Promise<void> {
  const existing = await prisma.equipment.findUnique({
    where: { orgId_equipmentNumber: { orgId, equipmentNumber } },
    select: { id: true, name: true },
  });
  if (existing && existing.id !== excludeEquipmentId) {
    throw new DuplicateEquipmentNumberError(equipmentNumber, existing.name);
  }
}

export async function createEquipment(orgId: string, input: CreateEquipmentInput): Promise<Equipment> {
  const data = createEquipmentSchema.parse(input);
  await assertEquipmentNumberAvailable(orgId, data.equipmentNumber);
  return prisma.equipment.create({ data: { ...data, orgId } });
}

export async function listEquipment(
  orgId: string,
  status?: Equipment["status"]
): Promise<Equipment[]> {
  return prisma.equipment.findMany({
    where: { orgId, ...(status ? { status } : {}) },
    orderBy: { name: "asc" },
  });
}

export async function getEquipmentById(orgId: string, id: string): Promise<Equipment | null> {
  return prisma.equipment.findFirst({ where: { id, orgId } });
}

// Used by the Excel importer to decide whether an imported row is a new
// piece of equipment or an update to an existing one.
export async function getEquipmentByNumber(
  orgId: string,
  equipmentNumber: string
): Promise<Equipment | null> {
  return prisma.equipment.findUnique({ where: { orgId_equipmentNumber: { orgId, equipmentNumber } } });
}

// Every equipment number in use, with enough of the machine to identify
// it in the importer's clash review. Same one-query-per-import reasoning
// as listEmployeeIdIndex; nextEquipmentNumber also needs the whole set at
// once to find the highest sequence in a type+capacity family.
export async function listEquipmentNumberIndex(
  orgId: string
): Promise<{ equipmentNumber: string; name: string; make: string; model: string }[]> {
  return prisma.equipment.findMany({
    where: { orgId },
    select: { equipmentNumber: true, name: true, make: true, model: true },
  });
}

export async function updateEquipment(
  orgId: string,
  id: string,
  input: UpdateEquipmentInput
): Promise<Equipment> {
  const data = updateEquipmentSchema.parse(input);
  if (data.equipmentNumber !== undefined) {
    // Excludes this piece of equipment, so re-saving the edit form
    // without changing the number does not report a clash with itself.
    await assertEquipmentNumberAvailable(orgId, data.equipmentNumber, id);
  }
  return prisma.equipment.update({ where: { id, orgId }, data });
}
