import { prisma } from "@/modules/shared/prisma";
import type { Assignment, Prisma } from "@prisma/client";
import { createAssignmentSchema, type CreateAssignmentInput } from "./schemas";
import { checkAssignmentConflict, type ExistingAssignment } from "./conflictCheck";
import { applyStockDelta, assertSufficientStock, InsufficientStockError } from "@/modules/inventory/ledger";

// Re-exported so callers that already import this error from the dispatch
// module keep working; it lives in the ledger now because that is what
// owns stock.
export { InsufficientStockError };

export class SchedulingConflictError extends Error {
  readonly conflicts: ExistingAssignment[];

  constructor(conflicts: ExistingAssignment[] = []) {
    const detail = conflicts
      .map((c) => (c.jobLabel ? ` (${c.jobLabel})` : ""))
      .filter(Boolean)
      .join(", ");
    super(
      `This resource is already assigned during the requested time window${detail}`
    );
    this.name = "SchedulingConflictError";
    this.conflicts = conflicts;
  }
}

// Postgres treats an open-ended assignment as running to 'infinity'. The
// JS side needs a concrete date for the same comparison; this is the
// largest value a Date can represent.
const FOREVER = new Date(8640000000000000);

// The EXCLUDE constraints added in the architecture-hardening migration
// are what actually prevent double-booking. This recognises one firing so
// it can be reported as a scheduling conflict rather than a crash.
//
// Previously this logic was a Serializable transaction wrapped in a retry
// loop around a full-history scan: correct, but it read every assignment a
// resource had ever had, and got slower and more contended as history
// grew. The database does the same job in an index.
const OVERLAP_CONSTRAINTS = new Set([
  "assignment_personnel_no_overlap",
  "assignment_equipment_no_overlap",
]);

function isOverlapViolation(err: unknown): boolean {
  if (!(err instanceof Error) || !("meta" in err)) return false;
  const cause = (
    err as { meta?: { driverAdapterError?: { cause?: { code?: string; message?: string } } } }
  ).meta?.driverAdapterError?.cause;
  if (cause?.code !== "23P01") return false;
  const constraint = cause.message?.match(/constraint "([^"]+)"/)?.[1];
  return constraint != null && OVERLAP_CONSTRAINTS.has(constraint);
}

// Handles PERSONNEL and EQUIPMENT assignments - resources with a schedule
// that can double-book.
//
// Two layers, deliberately:
//   1. A bounded query for assignments that actually overlap the candidate
//      window, so the common case produces a helpful message naming the
//      job the resource is already on. Note the window filter: this reads
//      the handful of assignments near the requested dates, not the
//      resource's entire history.
//   2. The database constraint, which is the actual guarantee. Two
//      dispatchers booking the same crane in the same millisecond both
//      pass step 1; exactly one of them gets past step 2.
async function createScheduledAssignment(
  orgId: string,
  data: CreateAssignmentInput
): Promise<Assignment> {
  const resourceField = data.resourceType === "PERSONNEL" ? "personnelId" : "equipmentId";
  const resourceId = data.personnelId ?? data.equipmentId;
  const candidateEnd = data.endAt ?? FOREVER;

  const overlapping = await prisma.assignment.findMany({
    where: {
      orgId,
      [resourceField]: resourceId,
      cancelledAt: null,
      startAt: { lt: candidateEnd },
      OR: [{ endAt: null }, { endAt: { gt: data.startAt } }],
    },
    select: {
      id: true,
      jobId: true,
      startAt: true,
      endAt: true,
      job: { select: { jobNumber: true, name: true } },
    },
  });

  const existing: ExistingAssignment[] = overlapping.map((a) => ({
    id: a.id,
    jobId: a.jobId,
    startAt: a.startAt,
    endAt: a.endAt,
    jobLabel: `${a.job.jobNumber} ${a.job.name}`,
  }));

  const { hasConflict, conflictingWith } = checkAssignmentConflict(
    { startAt: data.startAt, endAt: data.endAt ?? null },
    existing
  );
  if (hasConflict) {
    throw new SchedulingConflictError(conflictingWith);
  }

  try {
    return await prisma.assignment.create({ data: { ...data, orgId } });
  } catch (err) {
    if (isOverlapViolation(err)) {
      // Lost a race between the check above and the insert. The database
      // refused it, which is the point.
      throw new SchedulingConflictError();
    }
    throw err;
  }
}

// Handles MATERIAL assignments - these consume stock rather than occupying
// a schedule, so the logic is stock-sufficiency plus a ledger movement,
// not conflict-checking.
async function createMaterialAssignment(
  orgId: string,
  data: CreateAssignmentInput,
  createdBy?: string
): Promise<Assignment> {
  if (!data.materialId || data.quantity == null) {
    // Guarded by Zod already, and by a CHECK constraint in the database.
    // Kept as a type narrowing plus a loud failure if called incorrectly.
    throw new Error("createMaterialAssignment requires materialId and quantity");
  }
  const materialId = data.materialId;
  const quantity = data.quantity;

  return prisma.$transaction(async (tx) => {
    await assertSufficientStock(tx, orgId, materialId, quantity);
    const assignment = await tx.assignment.create({ data: { ...data, orgId } });

    await applyStockDelta(tx, {
      orgId,
      materialId,
      delta: -quantity,
      reason: "ASSIGNMENT",
      note: `Assigned to job ${assignment.jobId}`,
      assignmentId: assignment.id,
      createdBy,
    });

    return assignment;
  });
}

export async function createAssignment(
  orgId: string,
  input: CreateAssignmentInput,
  createdBy?: string
): Promise<Assignment> {
  const data = createAssignmentSchema.parse(input);

  if (data.resourceType === "MATERIAL") {
    return createMaterialAssignment(orgId, data, createdBy);
  }
  return createScheduledAssignment(orgId, data);
}

export async function listAssignmentsForJob(
  orgId: string,
  jobId: string,
  includeCancelled = false
): Promise<Assignment[]> {
  return prisma.assignment.findMany({
    where: { orgId, jobId, ...(includeCancelled ? {} : { cancelledAt: null }) },
    orderBy: { startAt: "asc" },
  });
}

export async function listAssignmentsForResource(
  orgId: string,
  resourceType: CreateAssignmentInput["resourceType"],
  resourceId: string,
  includeCancelled = false
): Promise<Assignment[]> {
  const field =
    resourceType === "PERSONNEL" ? "personnelId" :
    resourceType === "MATERIAL" ? "materialId" : "equipmentId";
  return prisma.assignment.findMany({
    where: {
      orgId,
      [field]: resourceId,
      ...(includeCancelled ? {} : { cancelledAt: null }),
    },
    orderBy: { startAt: "asc" },
  });
}

// Cancelling sets cancelledAt rather than deleting the row - see the note
// on Assignment.cancelledAt in schema.prisma. The overlap constraints skip
// cancelled rows, so the person or machine is immediately free to rebook.
//
// A cancelled MATERIAL assignment returns its stock with a compensating
// ledger movement in the same transaction, so a crash between the two
// steps cannot leave stock permanently short. The original ASSIGNMENT
// movement is left untouched: the ledger records what happened, not a
// tidied-up version of it.
export async function cancelAssignment(
  orgId: string,
  id: string,
  createdBy?: string
): Promise<Assignment> {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const assignment = await tx.assignment.findFirst({ where: { id, orgId } });
    if (!assignment) {
      throw Object.assign(new Error("Assignment not found"), { code: "P2025" });
    }
    if (assignment.cancelledAt) {
      // Already cancelled. Returning it unchanged keeps this idempotent -
      // a double-submitted cancel must not return the stock twice.
      return assignment;
    }

    const cancelled = await tx.assignment.update({
      where: { id, orgId },
      data: { cancelledAt: new Date() },
    });

    if (assignment.resourceType === "MATERIAL") {
      if (!assignment.materialId || assignment.quantity == null) {
        // A CHECK constraint makes this unreachable, but restoring the
        // wrong amount of stock is worse than failing loudly.
        throw new Error(
          `Assignment ${id} is MATERIAL type but missing materialId or quantity - cannot safely restore stock`
        );
      }
      await applyStockDelta(tx, {
        orgId,
        materialId: assignment.materialId,
        delta: assignment.quantity,
        reason: "ASSIGNMENT_CANCELLED",
        note: `Returned when the assignment to job ${assignment.jobId} was cancelled`,
        assignmentId: assignment.id,
        createdBy,
      });
    }

    return cancelled;
  });
}
