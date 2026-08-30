import { prisma } from "@/modules/shared/prisma";
import type { Vendor } from "@prisma/client";
import { createVendorSchema, updateVendorSchema, type CreateVendorInput, type UpdateVendorInput } from "./schemas";
import { filterVendorsByCategory } from "./matching";

// orgId is a required first argument on every function - see the note in
// jobs/repository.ts for why scoping is passed explicitly rather than
// read from ambient state.

export async function createVendor(orgId: string, input: CreateVendorInput): Promise<Vendor> {
  const data = createVendorSchema.parse(input);
  return prisma.vendor.create({ data: { ...data, orgId } });
}

export async function getVendorById(orgId: string, id: string): Promise<Vendor | null> {
  return prisma.vendor.findFirst({ where: { id, orgId } });
}

export async function listVendors(orgId: string): Promise<Vendor[]> {
  return prisma.vendor.findMany({ where: { orgId }, orderBy: { name: "asc" } });
}

// Delegates the actual matching rule to matching.ts rather than
// duplicating it in a Prisma `categories: { has: ... }` filter, so the
// case-insensitivity behavior is identical between this DB-backed
// lookup and the pure function tests cover.
export async function findVendorsByCategory(orgId: string, category: string): Promise<Vendor[]> {
  const all = await prisma.vendor.findMany({ where: { orgId }, orderBy: { name: "asc" } });
  return filterVendorsByCategory(all, category);
}

export async function updateVendor(
  orgId: string,
  id: string,
  input: UpdateVendorInput
): Promise<Vendor> {
  const data = updateVendorSchema.parse(input);
  return prisma.vendor.update({ where: { id, orgId }, data });
}

// Real delete, not soft-delete like Job's cancelJob - the current schema
// has no `isActive` flag on Vendor. Postgres rejects this if the vendor
// has related QuoteRequests/Quotes/PurchaseOrders, which classifies as a
// business error ("related records exist") rather than a crash. Worth
// revisiting: consider an isActive flag and a soft-delete matching the
// Job pattern once a vendor has real transaction history.
export async function deleteVendor(orgId: string, id: string): Promise<Vendor> {
  return prisma.vendor.delete({ where: { id, orgId } });
}
