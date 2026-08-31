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
    select: { id: true, name: true },
  });
  if (existing && existing.id !== excludePersonnelId) {
    throw new DuplicateEmployeeIdError(employeeId, existing.name);
  }
}

export async function createPersonnel(orgId: string, input: CreatePersonnelInput): Promise<Personnel> {
  const data = createPersonnelSchema.parse(input);
  await assertEmployeeIdAvailable(orgId, data.employeeId);
  return prisma.personnel.create({ data: { ...data, orgId } });
}

export async function listPersonnel(orgId: string, activeOnly = true): Promise<Personnel[]> {
  return prisma.personnel.findMany({
    where: { orgId, ...(activeOnly ? { isActive: true } : {}) },
    orderBy: { name: "asc" },
  });
}

export async function getPersonnelById(orgId: string, id: string): Promise<Personnel | null> {
  return prisma.personnel.findFirst({ where: { id, orgId } });
}

export async function updatePersonnel(
  orgId: string,
  id: string,
  input: UpdatePersonnelInput
): Promise<Personnel> {
  const data = updatePersonnelSchema.parse(input);
  if (data.employeeId !== undefined) {
    // Excludes this worker, so re-saving the edit form without changing
    // the number does not report a clash with themselves.
    await assertEmployeeIdAvailable(orgId, data.employeeId, id);
  }
  return prisma.personnel.update({ where: { id, orgId }, data });
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

export async function createEquipment(orgId: string, input: CreateEquipmentInput): Promise<Equipment> {
  const data = createEquipmentSchema.parse(input);
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

export async function updateEquipment(
  orgId: string,
  id: string,
  input: UpdateEquipmentInput
): Promise<Equipment> {
  const data = updateEquipmentSchema.parse(input);
  return prisma.equipment.update({ where: { id, orgId }, data });
}
