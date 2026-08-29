// NOTE ON VERIFICATION: same caveat as jobs/vendors/procurement
// repository.ts files — not typechecked or tested here, Prisma Client
// generation is network-blocked in this sandbox.

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

// --- Personnel ---

export async function createPersonnel(input: CreatePersonnelInput): Promise<Personnel> {
  const data = createPersonnelSchema.parse(input);
  return prisma.personnel.create({ data });
}

export async function listPersonnel(activeOnly = true): Promise<Personnel[]> {
  return prisma.personnel.findMany({
    where: activeOnly ? { isActive: true } : undefined,
    orderBy: { name: "asc" },
  });
}

export async function updatePersonnel(id: string, input: UpdatePersonnelInput): Promise<Personnel> {
  const data = updatePersonnelSchema.parse(input);
  return prisma.personnel.update({ where: { id }, data });
}

// Soft-delete, matching the Job/cancelJob pattern — a deactivated
// worker may still be referenced by historical Assignments.
export async function deactivatePersonnel(id: string): Promise<Personnel> {
  return prisma.personnel.update({ where: { id }, data: { isActive: false } });
}

// --- Material ---

export async function createMaterial(input: CreateMaterialInput): Promise<Material> {
  const data = createMaterialSchema.parse(input);
  return prisma.material.create({ data });
}

export async function listMaterials(): Promise<Material[]> {
  return prisma.material.findMany({ orderBy: { name: "asc" } });
}

export async function getMaterialBySku(sku: string): Promise<Material | null> {
  return prisma.material.findUnique({ where: { sku } });
}

export async function updateMaterial(id: string, input: UpdateMaterialInput): Promise<Material> {
  const data = updateMaterialSchema.parse(input);
  return prisma.material.update({ where: { id }, data });
}

// Applies a signed delta atomically via a DB-level increment, so two
// concurrent adjustments (e.g. a delivery arriving while a dispatcher
// assigns material to a job) can't silently clobber each other the way
// a read-then-write in application code would.
export async function adjustMaterialQuantity(
  input: AdjustMaterialQuantityInput
): Promise<Material> {
  const data = adjustMaterialQuantitySchema.parse(input);
  return prisma.material.update({
    where: { id: data.materialId },
    data: { quantityOnHand: { increment: data.delta } },
  });
}

// --- Equipment ---

export async function createEquipment(input: CreateEquipmentInput): Promise<Equipment> {
  const data = createEquipmentSchema.parse(input);
  return prisma.equipment.create({ data });
}

export async function listEquipment(status?: Equipment["status"]): Promise<Equipment[]> {
  return prisma.equipment.findMany({
    where: status ? { status } : undefined,
    orderBy: { name: "asc" },
  });
}

export async function updateEquipment(id: string, input: UpdateEquipmentInput): Promise<Equipment> {
  const data = updateEquipmentSchema.parse(input);
  return prisma.equipment.update({ where: { id }, data });
}
