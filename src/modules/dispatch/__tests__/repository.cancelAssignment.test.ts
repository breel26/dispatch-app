import { describe, it, expect, vi, beforeEach } from "vitest";

// Cancelling now soft-cancels (sets cancelledAt) instead of deleting, and
// returns material stock through a compensating ledger movement rather than
// a bare increment. Both changes exist so the stock ledger keeps its
// provenance: a deleted assignment would sever StockMovement.assignmentId
// and leave the returned stock unexplained.
const mockTransaction = vi.fn();

vi.mock("@/modules/shared/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

interface TxDoubles {
  findFirst: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  movementCreate: ReturnType<typeof vi.fn>;
  materialUpdate: ReturnType<typeof vi.fn>;
}

// Wires a transaction client whose pieces can each be asserted on.
function withTx(assignment: unknown): TxDoubles {
  const doubles: TxDoubles = {
    findFirst: vi.fn().mockResolvedValue(assignment),
    update: vi.fn().mockImplementation(async ({ data }) => ({
      ...(assignment as object),
      ...data,
    })),
    movementCreate: vi.fn().mockResolvedValue({}),
    materialUpdate: vi.fn().mockResolvedValue({}),
  };

  mockTransaction.mockImplementationOnce(async (fn) =>
    fn({
      assignment: { findFirst: doubles.findFirst, update: doubles.update },
      stockMovement: { create: doubles.movementCreate },
      material: { update: doubles.materialUpdate },
    })
  );

  return doubles;
}

describe("cancelAssignment", () => {
  beforeEach(() => {
    mockTransaction.mockReset();
  });

  it("returns material stock and cancels the assignment in one transaction", async () => {
    const { cancelAssignment } = await import("../repository");

    const tx = withTx({
      id: "a1",
      orgId: "org-1",
      jobId: "job-1",
      resourceType: "MATERIAL",
      materialId: "mat-1",
      quantity: 25,
      cancelledAt: null,
    });

    await cancelAssignment("org-1", "a1", "user-1");

    expect(tx.materialUpdate).toHaveBeenCalledWith({
      where: { id: "mat-1", orgId: "org-1" },
      data: { quantityOnHand: { increment: 25 } },
    });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("records why the stock came back, attributed to whoever cancelled it", async () => {
    const { cancelAssignment } = await import("../repository");

    const tx = withTx({
      id: "a1",
      orgId: "org-1",
      jobId: "job-1",
      resourceType: "MATERIAL",
      materialId: "mat-1",
      quantity: 25,
      cancelledAt: null,
    });

    await cancelAssignment("org-1", "a1", "user-1");

    expect(tx.movementCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org-1",
        materialId: "mat-1",
        delta: 25,
        reason: "ASSIGNMENT_CANCELLED",
        assignmentId: "a1",
        createdBy: "user-1",
      }),
    });
  });

  it("cancels rather than deletes, so the ledger keeps its link to the assignment", async () => {
    const { cancelAssignment } = await import("../repository");

    const tx = withTx({
      id: "a1",
      orgId: "org-1",
      jobId: "job-1",
      resourceType: "MATERIAL",
      materialId: "mat-1",
      quantity: 25,
      cancelledAt: null,
    });

    await cancelAssignment("org-1", "a1");

    expect(tx.update).toHaveBeenCalledWith({
      where: { id: "a1", orgId: "org-1" },
      data: { cancelledAt: expect.any(Date) },
    });
  });

  it("touches no stock for a PERSONNEL assignment", async () => {
    const { cancelAssignment } = await import("../repository");

    const tx = withTx({
      id: "a2",
      orgId: "org-1",
      jobId: "job-1",
      resourceType: "PERSONNEL",
      materialId: null,
      quantity: null,
      cancelledAt: null,
    });

    await cancelAssignment("org-1", "a2");

    expect(tx.update).toHaveBeenCalled();
    expect(tx.materialUpdate).not.toHaveBeenCalled();
    expect(tx.movementCreate).not.toHaveBeenCalled();
  });

  // A double-submitted cancel must not credit the stock twice. This is the
  // failure mode soft-cancellation introduces and hard deletion did not, so
  // it gets its own test.
  it("is idempotent: cancelling an already-cancelled assignment returns no further stock", async () => {
    const { cancelAssignment } = await import("../repository");

    const tx = withTx({
      id: "a3",
      orgId: "org-1",
      jobId: "job-1",
      resourceType: "MATERIAL",
      materialId: "mat-1",
      quantity: 25,
      cancelledAt: new Date("2026-06-01"),
    });

    await cancelAssignment("org-1", "a3");

    expect(tx.materialUpdate).not.toHaveBeenCalled();
    expect(tx.movementCreate).not.toHaveBeenCalled();
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("refuses to guess when a MATERIAL assignment is missing its quantity", async () => {
    const { cancelAssignment } = await import("../repository");

    withTx({
      id: "a4",
      orgId: "org-1",
      jobId: "job-1",
      resourceType: "MATERIAL",
      materialId: "mat-1",
      quantity: null, // impossible under the CHECK constraint; fail loudly anyway
      cancelledAt: null,
    });

    await expect(cancelAssignment("org-1", "a4")).rejects.toThrow(
      "missing materialId or quantity"
    );
  });

  it("reports a missing assignment as not found rather than crashing", async () => {
    const { cancelAssignment } = await import("../repository");

    withTx(null);

    await expect(cancelAssignment("org-1", "nope")).rejects.toMatchObject({ code: "P2025" });
  });

  // Passing another org's id must behave exactly like the row not existing.
  it("will not cancel an assignment belonging to another org", async () => {
    const { cancelAssignment } = await import("../repository");

    const tx = withTx(null);

    await expect(cancelAssignment("org-other", "a1")).rejects.toMatchObject({ code: "P2025" });
    expect(tx.findFirst).toHaveBeenCalledWith({ where: { id: "a1", orgId: "org-other" } });
  });
});
