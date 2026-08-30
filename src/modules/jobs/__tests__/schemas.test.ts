import { describe, it, expect } from "vitest";
import { createJobSchema, updateJobSchema } from "../schemas";

describe("createJobSchema", () => {
  it("accepts a minimal valid job", () => {
    const result = createJobSchema.safeParse({
      jobNumber: "J-1001",
      name: "Riverside Apartments Phase 2",
      siteAddress: "123 Riverside Dr",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a job with no jobNumber", () => {
    const result = createJobSchema.safeParse({
      name: "Riverside Apartments Phase 2",
      siteAddress: "123 Riverside Dr",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a job with an empty jobNumber", () => {
    const result = createJobSchema.safeParse({
      jobNumber: "",
      name: "Riverside Apartments Phase 2",
      siteAddress: "123 Riverside Dr",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a job with no name", () => {
    const result = createJobSchema.safeParse({
      jobNumber: "J-1001",
      siteAddress: "123 Riverside Dr",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a job with no siteAddress", () => {
    const result = createJobSchema.safeParse({
      jobNumber: "J-1001",
      name: "Riverside Apartments Phase 2",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an endDate before startDate", () => {
    const result = createJobSchema.safeParse({
      jobNumber: "J-1001",
      name: "Riverside Apartments Phase 2",
      siteAddress: "123 Riverside Dr",
      startDate: "2026-06-01",
      endDate: "2026-05-01",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an endDate equal to startDate (single-day job)", () => {
    const result = createJobSchema.safeParse({
      jobNumber: "J-1002",
      name: "One Day Inspection",
      siteAddress: "123 Riverside Dr",
      startDate: "2026-06-01",
      endDate: "2026-06-01",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an endDate after startDate", () => {
    const result = createJobSchema.safeParse({
      jobNumber: "J-1001",
      name: "Riverside Apartments Phase 2",
      siteAddress: "123 Riverside Dr",
      startDate: "2026-06-01",
      endDate: "2026-08-01",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateJobSchema", () => {
  it("accepts a partial update with just notes", () => {
    const result = updateJobSchema.safeParse({ notes: "Delayed due to weather" });
    expect(result.success).toBe(true);
  });

  it("accepts an empty update object", () => {
    const result = updateJobSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("rejects an endDate before startDate on update", () => {
    const result = updateJobSchema.safeParse({
      startDate: "2026-06-01",
      endDate: "2026-05-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty string name (distinct from omitting name)", () => {
    const result = updateJobSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an empty string jobNumber (distinct from omitting jobNumber)", () => {
    const result = updateJobSchema.safeParse({ jobNumber: "" });
    expect(result.success).toBe(false);
  });
});
