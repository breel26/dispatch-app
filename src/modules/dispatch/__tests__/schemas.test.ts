import { describe, it, expect } from "vitest";
import { createAssignmentSchema } from "../schemas";

const base = {
  jobId: "job-1",
  startAt: "2026-06-01",
};

describe("createAssignmentSchema", () => {
  it("accepts a valid PERSONNEL assignment without a quantity", () => {
    const result = createAssignmentSchema.safeParse({
      ...base,
      resourceType: "PERSONNEL",
      personnelId: "person-1",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid MATERIAL assignment with a quantity", () => {
    const result = createAssignmentSchema.safeParse({
      ...base,
      resourceType: "MATERIAL",
      materialId: "mat-1",
      quantity: 50,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid EQUIPMENT assignment with a quantity", () => {
    const result = createAssignmentSchema.safeParse({
      ...base,
      resourceType: "EQUIPMENT",
      equipmentId: "equip-1",
      quantity: 1,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a MATERIAL assignment with no quantity", () => {
    const result = createAssignmentSchema.safeParse({
      ...base,
      resourceType: "MATERIAL",
      materialId: "mat-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when no resource id is provided at all", () => {
    const result = createAssignmentSchema.safeParse({
      ...base,
      resourceType: "PERSONNEL",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when more than one resource id is provided", () => {
    const result = createAssignmentSchema.safeParse({
      ...base,
      resourceType: "PERSONNEL",
      personnelId: "person-1",
      materialId: "mat-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects when resourceType does not match the provided id (mismatch)", () => {
    const result = createAssignmentSchema.safeParse({
      ...base,
      resourceType: "PERSONNEL",
      materialId: "mat-1", // wrong field for PERSONNEL
      quantity: 10,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an endAt before startAt", () => {
    const result = createAssignmentSchema.safeParse({
      ...base,
      resourceType: "PERSONNEL",
      personnelId: "person-1",
      startAt: "2026-06-10",
      endAt: "2026-06-05",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an open-ended assignment with no endAt", () => {
    const result = createAssignmentSchema.safeParse({
      ...base,
      resourceType: "EQUIPMENT",
      equipmentId: "equip-1",
      quantity: 1,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a zero or negative quantity for MATERIAL", () => {
    const result = createAssignmentSchema.safeParse({
      ...base,
      resourceType: "MATERIAL",
      materialId: "mat-1",
      quantity: 0,
    });
    expect(result.success).toBe(false);
  });
});
