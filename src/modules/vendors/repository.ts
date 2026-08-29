// NOTE ON VERIFICATION: same caveat as src/modules/jobs/repository.ts —
// not typechecked or tested here because Prisma Client generation is
// network-blocked in this sandbox. Verify locally before trusting it.

import { prisma } from "@/modules/shared/prisma";
import type { Vendor } from "@prisma/client";
import { createVendorSchema, updateVendorSchema, type CreateVendorInput, type UpdateVendorInput } from "./schemas";

export async function createVendor(input: CreateVendorInput): Promise<Vendor> {
  const data = createVendorSchema.parse(input);
  return prisma.vendor.create({ data });
}

export async function getVendorById(id: string): Promise<Vendor | null> {
  return prisma.vendor.findUnique({ where: { id } });
}

export async function listVendors(): Promise<Vendor[]> {
  return prisma.vendor.findMany({ orderBy: { name: "asc" } });
}

// Delegates the actual matching rule to matching.ts rather than
// duplicating it in a Prisma `categories: { has: ... }` filter, so the
// case-insensitivity behavior is identical between this DB-backed
// lookup and the pure function tests cover.
export async function findVendorsByCategory(category: string): Promise<Vendor[]> {
  const all = await prisma.vendor.findMany({ orderBy: { name: "asc" } });
  const { filterVendorsByCategory } = await import("./matching");
  return filterVendorsByCategory(all, category);
}

export async function updateVendor(id: string, input: UpdateVendorInput): Promise<Vendor> {
  const data = updateVendorSchema.parse(input);
  return prisma.vendor.update({ where: { id }, data });
}

// Real delete, not soft-delete like Job's cancelJob — the current
// schema has no `isActive` flag on Vendor. Postgres will reject this if
// the vendor has related QuoteRequests/Quotes/PurchaseOrders (no
// onDelete: Cascade is set in schema.prisma), which is a safe default,
// but the error won't be a friendly one. Worth revisiting: consider
// adding an isActive flag and switching this to a soft-delete, matching
// the Job pattern, once a vendor has real transaction history.
export async function deleteVendor(id: string): Promise<Vendor> {
  return prisma.vendor.delete({ where: { id } });
}
