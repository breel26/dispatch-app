import { describe, it, expect } from "vitest";
import { z } from "zod";
import { handleApiError } from "../apiError";

class SchedulingConflictError extends Error {
  constructor() {
    super("conflict");
    this.name = "SchedulingConflictError";
  }
}

class InsufficientStockError extends Error {
  constructor() {
    super("insufficient stock");
    this.name = "InsufficientStockError";
  }
}

describe("handleApiError", () => {
  it("returns 400 for a Zod validation error", async () => {
    const schema = z.object({ name: z.string() });
    const result = schema.safeParse({});
    const response = handleApiError(result.error);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Validation failed");
  });

  it("returns 409 for a SchedulingConflictError", async () => {
    const response = handleApiError(new SchedulingConflictError());
    expect(response.status).toBe(409);
  });

  it("returns 409 for an InsufficientStockError", async () => {
    const response = handleApiError(new InsufficientStockError());
    expect(response.status).toBe(409);
  });

  it("returns 404 for a Prisma P2025 (not found) error", async () => {
    const err = Object.assign(new Error("not found"), { code: "P2025" });
    const response = handleApiError(err);
    expect(response.status).toBe(404);
  });

  it("returns 409 for a Prisma P2003 (foreign key) error", async () => {
    const err = Object.assign(new Error("fk violation"), { code: "P2003" });
    const response = handleApiError(err);
    expect(response.status).toBe(409);
  });

  it("returns 409 for a Prisma P2002 (unique constraint) error", async () => {
    const err = Object.assign(new Error("unique violation"), {
      code: "P2002",
      meta: { target: ["jobNumber"] },
    });
    const response = handleApiError(err);
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error).toBe("A record with this jobNumber already exists");
  });

  it("returns 500 for an unrecognized error", async () => {
    const response = handleApiError(new Error("something unexpected"));
    expect(response.status).toBe(500);
  });

  it("returns 500 for a non-Error thrown value", async () => {
    const response = handleApiError("just a string, not even an Error");
    expect(response.status).toBe(500);
  });
});
