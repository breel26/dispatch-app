import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindUniqueOrThrow = vi.fn();
const mockTransaction = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/modules/shared/prisma", () => ({
  prisma: {
    assignment: {
      findUniqueOrThrow: (...args: unknown[]) => mockFindUniqueOrThrow(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

describe("cancelAssignment", () => {
  beforeEach(() => {
    mockFindUniqueOrThrow.mockReset();
    mockTransaction.mockReset();
    mockDelete.mockReset();
  });

  it("restores material stock and deletes the assignment atomically for a MATERIAL assignment", async () => {
    const { cancelAssignment } = await import("../repository");

    mockFindUniqueOrThrow.mockResolvedValue({
      id: "a1",
      resourceType: "MATERIAL",
      materialId: "mat-1",
      quantity: 25,
    });

    const materialUpdate = vi.fn().mockResolvedValue({});
    const assignmentDelete = vi.fn().mockResolvedValue({ id: "a1" });

    mockTransaction.mockImplementationOnce(async (fn) =>
      fn({
        material: { update: materialUpdate },
        assignment: { delete: assignmentDelete },
      })
    );

    await cancelAssignment("a1");

    // Confirm stock was restored with the correct increment amount
    expect(materialUpdate).toHaveBeenCalledWith({
      where: { id: "mat-1" },
      data: { quantityOnHand: { increment: 25 } },
    });
    // Confirm the assignment was deleted in the SAME transaction call
    expect(assignmentDelete).toHaveBeenCalledWith({ where: { id: "a1" } });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("just deletes the row for a PERSONNEL assignment, no transaction/stock logic", async () => {
    const { cancelAssignment } = await import("../repository");

    mockFindUniqueOrThrow.mockResolvedValue({
      id: "a2",
      resourceType: "PERSONNEL",
      materialId: null,
      quantity: null,
    });
    mockDelete.mockResolvedValue({ id: "a2" });

    await cancelAssignment("a2");

    expect(mockDelete).toHaveBeenCalledWith({ where: { id: "a2" } });
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("throws rather than silently skipping restoration if a MATERIAL assignment is missing quantity data", async () => {
    const { cancelAssignment } = await import("../repository");

    mockFindUniqueOrThrow.mockResolvedValue({
      id: "a3",
      resourceType: "MATERIAL",
      materialId: "mat-1",
      quantity: null, // corrupted/invalid state
    });

    await expect(cancelAssignment("a3")).rejects.toThrow("missing materialId or quantity");
    expect(mockTransaction).not.toHaveBeenCalled();
  });
});
