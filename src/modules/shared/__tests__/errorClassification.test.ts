import { describe, it, expect, vi, afterEach } from "vitest";
import { z } from "zod";
import { classifyError } from "../errorClassification";

// Replaces the old apiError test. The REST layer it covered is gone; the
// classification underneath it is shared by every Server Action and is what
// actually decides what a dispatcher reads, so that is what gets tested.

afterEach(() => {
  vi.restoreAllMocks();
});

function prismaError(code: string, meta?: unknown) {
  const err = new Error(`Prisma error ${code}`) as Error & { code: string; meta?: unknown };
  err.code = code;
  if (meta !== undefined) err.meta = meta;
  return err;
}

// The exact shape Prisma 7 with the pg driver adapter produces for a raw
// Postgres constraint failure, confirmed against the live database.
function dbConstraintError(sqlState: string, constraint: string) {
  return prismaError("P2039", {
    modelName: "Assignment",
    driverAdapterError: {
      name: "DriverAdapterError",
      cause: {
        code: sqlState,
        message: `violates constraint "${constraint}"`,
      },
    },
  });
}

describe("classifyError", () => {
  it("classifies a Zod failure as validation, keeping the issues", () => {
    const result = z.object({ name: z.string() }).safeParse({ name: 123 });
    const classification = classifyError(result.error);

    expect(classification.kind).toBe("validation");
    expect(classification).toHaveProperty("details");
  });

  it("classifies domain errors by name", () => {
    const err = new Error("This resource is already assigned");
    err.name = "SchedulingConflictError";

    expect(classifyError(err)).toEqual({
      kind: "business",
      message: "This resource is already assigned",
    });
  });

  it("classifies an auth failure as unauthenticated", () => {
    const err = new Error("You must be signed in to do that");
    err.name = "NotAuthenticatedError";

    expect(classifyError(err).kind).toBe("unauthenticated");
  });

  it("classifies a role refusal as forbidden, preserving the explanation", () => {
    const err = new Error("Your role does not permit you to issue a purchase order");
    err.name = "ForbiddenError";

    expect(classifyError(err)).toEqual({
      kind: "forbidden",
      message: "Your role does not permit you to issue a purchase order",
    });
  });

  it("classifies a missing record as not found", () => {
    expect(classifyError(prismaError("P2025")).kind).toBe("notFound");
  });

  it("classifies a foreign-key failure as a business error", () => {
    expect(classifyError(prismaError("P2003")).kind).toBe("business");
  });

  it("names the duplicated field on a uniqueness failure", () => {
    const classification = classifyError(prismaError("P2002", { target: ["jobNumber"] }));

    expect(classification.message).toContain("jobNumber");
  });

  // Uniqueness is per-org now, so the composite key includes orgId. Echoing
  // it back would produce "a record with this orgId, sku already exists",
  // which tells the dispatcher nothing useful.
  it("hides the orgId half of a composite uniqueness failure", () => {
    const classification = classifyError(prismaError("P2002", { target: ["orgId", "sku"] }));

    expect(classification.message).toContain("sku");
    expect(classification.message).not.toContain("orgId");
  });

  describe("database constraint violations", () => {
    // These fire in normal use - they are what prevent double-booking when
    // two dispatchers act at the same instant - so they must read as a
    // business outcome, not a crash.
    it("turns an overlap exclusion violation into a readable conflict", () => {
      const classification = classifyError(
        dbConstraintError("23P01", "assignment_personnel_no_overlap")
      );

      expect(classification.kind).toBe("business");
      expect(classification.message).toMatch(/already assigned/i);
    });

    it("explains an equipment overlap distinctly from a personnel one", () => {
      const personnel = classifyError(
        dbConstraintError("23P01", "assignment_personnel_no_overlap")
      );
      const equipment = classifyError(
        dbConstraintError("23P01", "assignment_equipment_no_overlap")
      );

      expect(personnel.message).not.toBe(equipment.message);
      expect(equipment.message).toMatch(/equipment/i);
    });

    it("explains a CHECK violation instead of reporting a server error", () => {
      const classification = classifyError(
        dbConstraintError("23514", "po_line_item_amounts")
      );

      expect(classification.kind).toBe("business");
      expect(classification.message).toMatch(/greater than zero/i);
    });

    it("still reports a business error for a constraint it does not recognise", () => {
      const classification = classifyError(dbConstraintError("23514", "some_future_constraint"));

      expect(classification.kind).toBe("business");
      expect(classification.message).toMatch(/data rule/i);
    });

    // Reading the error must not itself throw if Prisma reshapes `meta`.
    it("degrades to an internal error when the adapter shape is unfamiliar", () => {
      vi.spyOn(console, "error").mockImplementation(() => {});

      expect(classifyError(prismaError("P2039", { driverAdapterError: null })).kind).toBe(
        "internal"
      );
      expect(classifyError(prismaError("P2039", "not an object")).kind).toBe("internal");
    });
  });

  it("classifies anything unrecognised as internal without leaking the message", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const classification = classifyError(new Error("connection string contains a password"));

    expect(classification).toEqual({ kind: "internal", message: "Internal server error" });
  });

  it("handles a thrown non-Error value", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(classifyError("just a string").kind).toBe("internal");
    expect(classifyError(null).kind).toBe("internal");
  });
});
