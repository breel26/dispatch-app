import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks the shared Prisma singleton before importing the repository, so the
// conflict logic can be driven without a database.
//
// What this proves: given a set of overlapping assignments, does the code
// refuse the booking with a useful message, and does it recognise the
// database's own refusal when it loses a race?
//
// What this does NOT prove: that Postgres actually rejects overlapping
// rows. That is the EXCLUDE constraint's job and is covered by
// assignmentOverlap.integration.test.ts against a real database. The two
// tests are deliberately separate - this one is fast and runs everywhere,
// that one needs a real Postgres.
const mockFindMany = vi.fn();
const mockCreate = vi.fn();

vi.mock("@/modules/shared/prisma", () => ({
  prisma: {
    assignment: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

// The shape Prisma 7 with a driver adapter produces for a raw Postgres
// constraint failure - verified against the live database, not invented.
function exclusionViolation(constraint: string) {
  const err = new Error("Database error") as Error & {
    code: string;
    meta: unknown;
  };
  err.code = "P2039";
  err.meta = {
    modelName: "Assignment",
    driverAdapterError: {
      name: "DriverAdapterError",
      cause: {
        code: "23P01",
        message: `conflicting key value violates exclusion constraint "${constraint}"`,
      },
    },
  };
  return err;
}

const baseInput = {
  jobId: "job-1",
  resourceType: "EQUIPMENT" as const,
  equipmentId: "eq-1",
  quantity: 1,
  startAt: new Date("2026-06-05"),
  endAt: new Date("2026-06-08"),
};

describe("createAssignment scheduling conflicts", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockCreate.mockReset();
  });

  it("creates the assignment when nothing overlaps", async () => {
    const { createAssignment } = await import("../repository");

    mockFindMany.mockResolvedValue([]);
    mockCreate.mockResolvedValue({ id: "a1", ...baseInput });

    const result = await createAssignment("org-1", baseInput);

    expect(result).toMatchObject({ id: "a1" });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("scopes the assignment to the caller's org", async () => {
    const { createAssignment } = await import("../repository");

    mockFindMany.mockResolvedValue([]);
    mockCreate.mockResolvedValue({ id: "a1" });

    await createAssignment("org-1", baseInput);

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ orgId: "org-1" }),
    });
  });

  // The old implementation loaded every assignment a resource had ever had
  // and filtered in JS. This asserts the query is bounded to the candidate
  // window, because that is the difference between a constant-time booking
  // and one that degrades as history accumulates.
  it("only queries assignments that could overlap the requested window", async () => {
    const { createAssignment } = await import("../repository");

    mockFindMany.mockResolvedValue([]);
    mockCreate.mockResolvedValue({ id: "a1" });

    await createAssignment("org-1", baseInput);

    const where = mockFindMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      orgId: "org-1",
      equipmentId: "eq-1",
      cancelledAt: null,
      startAt: { lt: baseInput.endAt },
    });
    expect(where.OR).toEqual([{ endAt: null }, { endAt: { gt: baseInput.startAt } }]);
  });

  it("refuses a booking that overlaps an existing one, without attempting the insert", async () => {
    const { createAssignment, SchedulingConflictError } = await import("../repository");

    mockFindMany.mockResolvedValue([
      {
        id: "existing",
        jobId: "job-2",
        startAt: new Date("2026-06-01"),
        endAt: new Date("2026-06-10"),
        job: { jobNumber: "1042", name: "Riverside Bridge" },
      },
    ]);

    await expect(createAssignment("org-1", baseInput)).rejects.toThrow(SchedulingConflictError);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("names the conflicting job so the dispatcher knows where the resource is", async () => {
    const { createAssignment } = await import("../repository");

    mockFindMany.mockResolvedValue([
      {
        id: "existing",
        jobId: "job-2",
        startAt: new Date("2026-06-01"),
        endAt: new Date("2026-06-10"),
        job: { jobNumber: "1042", name: "Riverside Bridge" },
      },
    ]);

    await expect(createAssignment("org-1", baseInput)).rejects.toThrow(/1042 Riverside Bridge/);
  });

  // Losing the race between the pre-check and the insert is the case the
  // database constraint exists for. It must surface as a scheduling
  // conflict, not as an unhandled crash.
  it("translates the database's own overlap rejection into a scheduling conflict", async () => {
    const { createAssignment, SchedulingConflictError } = await import("../repository");

    mockFindMany.mockResolvedValue([]);
    mockCreate.mockRejectedValue(exclusionViolation("assignment_equipment_no_overlap"));

    await expect(createAssignment("org-1", baseInput)).rejects.toThrow(SchedulingConflictError);
  });

  it("recognises the personnel overlap constraint too", async () => {
    const { createAssignment, SchedulingConflictError } = await import("../repository");

    mockFindMany.mockResolvedValue([]);
    mockCreate.mockRejectedValue(exclusionViolation("assignment_personnel_no_overlap"));

    await expect(
      createAssignment("org-1", {
        jobId: "job-1",
        resourceType: "PERSONNEL",
        personnelId: "p-1",
        startAt: new Date("2026-06-05"),
      })
    ).rejects.toThrow(SchedulingConflictError);
  });

  // An unrelated database failure must not be disguised as a scheduling
  // conflict - that would tell the dispatcher to rebook when the real
  // problem is something else entirely.
  it("rethrows database errors that are not overlap violations", async () => {
    const { createAssignment, SchedulingConflictError } = await import("../repository");

    mockFindMany.mockResolvedValue([]);
    mockCreate.mockRejectedValue(new Error("connection reset"));

    await expect(createAssignment("org-1", baseInput)).rejects.toThrow("connection reset");
    await expect(createAssignment("org-1", baseInput)).rejects.not.toThrow(
      SchedulingConflictError
    );
  });

  it("does not mistake a different exclusion constraint for a booking overlap", async () => {
    const { createAssignment, SchedulingConflictError } = await import("../repository");

    mockFindMany.mockResolvedValue([]);
    mockCreate.mockRejectedValue(exclusionViolation("some_unrelated_constraint"));

    await expect(createAssignment("org-1", baseInput)).rejects.not.toThrow(
      SchedulingConflictError
    );
  });
});
