// NOTE ON VERIFICATION: same caveat as the other repository.ts files in
// this project — not typechecked or tested here, Prisma Client
// generation is network-blocked in this sandbox. The conflict-check
// path below has a real race condition worth understanding before you
// rely on it (see the comment on createPersonnelOrEquipmentAssignment) —
// this needs a DB-level constraint or serializable transaction to be
// fully safe under concurrency, not just an application-level check.

import { prisma } from "@/modules/shared/prisma";
import type { Assignment } from "@prisma/client";
import { createAssignmentSchema, type CreateAssignmentInput } from "./schemas";
import { wouldDoubleBook } from "./conflictCheck";
import { hasSufficientStock } from "@/modules/inventory/stockLevels";

export class SchedulingConflictError extends Error {
  constructor() {
    super("This resource is already assigned during the requested time window");
    this.name = "SchedulingConflictError";
  }
}

export class InsufficientStockError extends Error {
  constructor(materialId: string, requested: number, available: number) {
    super(
      `Insufficient stock for material ${materialId}: requested ${requested}, only ${available} on hand`
    );
    this.name = "InsufficientStockError";
  }
}

// Handles PERSONNEL and EQUIPMENT assignments — resources with a
// schedule that can double-book.
//
// CONCURRENCY CAVEAT: this checks for conflicts, then creates the
// assignment, as two separate steps. Under concurrent requests, two
// dispatchers could both pass the conflict check for the same time slot
// before either has created their assignment (classic check-then-act
// race). Wrapping both steps in a single serializable transaction, or
// adding a DB-level exclusion constraint on (resourceId, timerange),
// closes this gap — neither is done here. Treat this function as
// correct for the common case (dispatchers acting minutes apart) but
// NOT safe against simultaneous double-booking attempts until one of
// those fixes is added.
async function createPersonnelOrEquipmentAssignment(
  data: CreateAssignmentInput
): Promise<Assignment> {
  const resourceField = data.resourceType === "PERSONNEL" ? "personnelId" : "equipmentId";
  const resourceId = data.personnelId ?? data.equipmentId;

  const existing = await prisma.assignment.findMany({
    where: { [resourceField]: resourceId },
    select: { id: true, jobId: true, startAt: true, endAt: true },
  });

  const candidate = { startAt: data.startAt, endAt: data.endAt ?? null };
  if (wouldDoubleBook(candidate, existing)) {
    throw new SchedulingConflictError();
  }

  return prisma.assignment.create({ data });
}

// Handles MATERIAL assignments — these consume stock rather than
// occupying a schedule, so the logic is stock-sufficiency + atomic
// deduction inside a transaction, not conflict-checking.
async function createMaterialAssignment(data: CreateAssignmentInput): Promise<Assignment> {
  if (!data.materialId || !data.quantity) {
    // Guarded by Zod already, but keeps TypeScript satisfied and fails
    // loudly if this function is ever called incorrectly.
    throw new Error("createMaterialAssignment requires materialId and quantity");
  }

  return prisma.$transaction(async (tx) => {
    const material = await tx.material.findUniqueOrThrow({ where: { id: data.materialId } });

    if (!hasSufficientStock(material, data.quantity!)) {
      throw new InsufficientStockError(data.materialId!, data.quantity!, material.quantityOnHand);
    }

    await tx.material.update({
      where: { id: data.materialId },
      data: { quantityOnHand: { decrement: data.quantity! } },
    });

    return tx.assignment.create({ data });
  });
}

export async function createAssignment(input: CreateAssignmentInput): Promise<Assignment> {
  const data = createAssignmentSchema.parse(input);

  if (data.resourceType === "MATERIAL") {
    return createMaterialAssignment(data);
  }
  return createPersonnelOrEquipmentAssignment(data);
}

export async function listAssignmentsForJob(jobId: string): Promise<Assignment[]> {
  return prisma.assignment.findMany({
    where: { jobId },
    orderBy: { startAt: "asc" },
  });
}

export async function listAssignmentsForResource(
  resourceType: CreateAssignmentInput["resourceType"],
  resourceId: string
): Promise<Assignment[]> {
  const field =
    resourceType === "PERSONNEL" ? "personnelId" :
    resourceType === "MATERIAL" ? "materialId" : "equipmentId";
  return prisma.assignment.findMany({
    where: { [field]: resourceId },
    orderBy: { startAt: "asc" },
  });
}

// Removing a PERSONNEL/EQUIPMENT assignment just deletes the row — no
// stock to restore. A MATERIAL assignment's removal SHOULD restore the
// deducted quantity but that's not implemented here yet; flagging
// rather than silently leaving it half-done.
export async function cancelAssignment(id: string): Promise<Assignment> {
  const assignment = await prisma.assignment.findUniqueOrThrow({ where: { id } });
  if (assignment.resourceType === "MATERIAL") {
    throw new Error(
      "cancelAssignment for MATERIAL is not yet implemented — it needs to restore " +
      "the deducted stock atomically, not just delete the row. Do not call this for " +
      "material assignments until that's built."
    );
  }
  return prisma.assignment.delete({ where: { id } });
}
