import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the shared Prisma singleton before importing the repository, so
// we can control exactly what $transaction does across multiple calls
// without touching a real database. This tests the retry-on-P2034
// LOGIC specifically — it does not prove Postgres actually returns
// P2034 under real contention (that's what poNumber.integration.test.ts
// / a real concurrency test against Postgres would prove for this
// function). This test proves: "if Prisma throws a P2034-coded error,
// does our code correctly retry and eventually succeed or give up?"
const mockTransaction = vi.fn();
const mockAssignmentFindMany = vi.fn();

vi.mock("@/modules/shared/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

function serializationError() {
  const err = new Error("could not serialize access due to concurrent update") as Error & { code: string };
  err.code = "P2034";
  return err;
}

describe("createPersonnelOrEquipmentAssignment retry behavior", () => {
  beforeEach(() => {
    mockTransaction.mockReset();
    mockAssignmentFindMany.mockReset();
  });

  it("succeeds on the first attempt when there's no contention", async () => {
    const { createAssignment } = await import("../repository");

    mockTransaction.mockImplementationOnce(async (fn) =>
      fn({
        assignment: {
          findMany: async () => [],
          create: async ({ data }: { data: unknown }) => ({ id: "a1", ...data as object }),
        },
      })
    );

    const result = await createAssignment({
      jobId: "job-1",
      resourceType: "EQUIPMENT",
      equipmentId: "eq-1",
      quantity: 1,
      startAt: new Date("2026-06-01"),
    });

    expect(result).toMatchObject({ id: "a1", jobId: "job-1" });
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });

  it("retries after a P2034 serialization failure and succeeds on the second attempt", async () => {
    const { createAssignment } = await import("../repository");

    mockTransaction
      .mockImplementationOnce(async () => {
        throw serializationError();
      })
      .mockImplementationOnce(async (fn) =>
        fn({
          assignment: {
            findMany: async () => [],
            create: async ({ data }: { data: unknown }) => ({ id: "a2", ...data as object }),
          },
        })
      );

    const result = await createAssignment({
      jobId: "job-1",
      resourceType: "EQUIPMENT",
      equipmentId: "eq-1",
      quantity: 1,
      startAt: new Date("2026-06-01"),
    });

    expect(result).toMatchObject({ id: "a2" });
    expect(mockTransaction).toHaveBeenCalledTimes(2);
  });

  it("gives up and throws after exhausting all retries under sustained contention", async () => {
    const { createAssignment } = await import("../repository");

    mockTransaction.mockImplementation(async () => {
      throw serializationError();
    });

    await expect(
      createAssignment({
        jobId: "job-1",
        resourceType: "EQUIPMENT",
        equipmentId: "eq-1",
        quantity: 1,
        startAt: new Date("2026-06-01"),
      })
    ).rejects.toThrow();

    // MAX_SERIALIZATION_RETRIES is 3 — confirm we didn't retry forever
    expect(mockTransaction).toHaveBeenCalledTimes(3);
  });

  it("does not retry a genuine SchedulingConflictError (only retries P2034)", async () => {
    const { createAssignment, SchedulingConflictError } = await import("../repository");

    mockTransaction.mockImplementationOnce(async (fn) =>
      fn({
        assignment: {
          findMany: async () => [
            { id: "existing", jobId: "job-2", startAt: new Date("2026-06-01"), endAt: new Date("2026-06-10") },
          ],
          create: async () => {
            throw new Error("should not reach create — conflict should be caught first");
          },
        },
      })
    );

    await expect(
      createAssignment({
        jobId: "job-1",
        resourceType: "EQUIPMENT",
        equipmentId: "eq-1",
        quantity: 1,
        startAt: new Date("2026-06-05"),
        endAt: new Date("2026-06-08"),
      })
    ).rejects.toThrow(SchedulingConflictError);

    // A real conflict is not contention — should not retry
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});
