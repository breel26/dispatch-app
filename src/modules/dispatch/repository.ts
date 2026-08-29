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
// CONCURRENCY FIX (previously flagged as an open gap): the conflict
// check and the create are now wrapped in a single Serializable
// transaction. Postgres will abort one of two concurrent transactions
// that both try to book the same resource for an overlapping window
// with a serialization failure (error code 40001 / Prisma P2034) rather
// than silently letting both succeed. We catch that specific error and
// retry a bounded number of times, since a serialization failure is
// expected/normal contention, not a real error, and the retry will see
// the other transaction's committed assignment on its next attempt.
const MAX_SERIALIZATION_RETRIES = 3;

async function createPersonnelOrEquipmentAssignment(
  data: CreateAssignmentInput
): Promise<Assignment> {
  const resourceField = data.resourceType === "PERSONNEL" ? "personnelId" : "equipmentId";
  const resourceId = data.personnelId ?? data.equipmentId;
  const candidate = { startAt: data.startAt, endAt: data.endAt ?? null };

  for (let attempt = 1; attempt <= MAX_SERIALIZATION_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const existing = await tx.assignment.findMany({
            where: { [resourceField]: resourceId },
            select: { id: true, jobId: true, startAt: true, endAt: true },
          });

          if (wouldDoubleBook(candidate, existing)) {
            throw new SchedulingConflictError();
          }

          return tx.assignment.create({ data });
        },
        { isolationLevel: "Serializable" }
      );
    } catch (err) {
      const isSerializationFailure =
        err instanceof Error && "code" in err && (err as { code?: string }).code === "P2034";
      if (isSerializationFailure && attempt < MAX_SERIALIZATION_RETRIES) {
        continue; // real contention, safe to retry — loop again
      }
      throw err; // either a genuine SchedulingConflictError, or retries exhausted
    }
  }

  // Unreachable, but keeps TypeScript satisfied about a return on every path.
  throw new Error("createPersonnelOrEquipmentAssignment: exhausted retries unexpectedly");
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
// stock to restore. Removing a MATERIAL assignment restores the
// deducted quantity atomically in the same transaction as the delete,
// so a crash between the two steps can't leave stock permanently
// short. (Previously this threw "not implemented" for MATERIAL — that
// gap is now closed.)
export async function cancelAssignment(id: string): Promise<Assignment> {
  const assignment = await prisma.assignment.findUniqueOrThrow({ where: { id } });

  if (assignment.resourceType === "MATERIAL") {
    if (!assignment.materialId || assignment.quantity == null) {
      // Should be impossible given the create-time validation, but
      // fail loudly rather than silently skip the stock restoration if
      // it somehow happens.
      throw new Error(
        `Assignment ${id} is MATERIAL type but missing materialId or quantity — cannot safely restore stock`
      );
    }

    return prisma.$transaction(async (tx) => {
      await tx.material.update({
        where: { id: assignment.materialId! },
        data: { quantityOnHand: { increment: assignment.quantity! } },
      });
      return tx.assignment.delete({ where: { id } });
    });
  }

  return prisma.assignment.delete({ where: { id } });
}
