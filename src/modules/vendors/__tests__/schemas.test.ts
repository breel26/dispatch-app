import { describe, it, expect } from "vitest";
import { createVendorSchema, updateVendorSchema } from "../schemas";

describe("createVendorSchema", () => {
  it("accepts a valid vendor", () => {
    const result = createVendorSchema.safeParse({
      name: "ABC Concrete Supply",
      email: "sales@abcconcrete.com",
      categories: ["concrete"],
    });
    expect(result.success).toBe(true);
  });

  it("defaults categories to an empty array when omitted", () => {
    const result = createVendorSchema.safeParse({
      name: "ABC Concrete Supply",
      email: "sales@abcconcrete.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.categories).toEqual([]);
    }
  });

  it("rejects an invalid email address", () => {
    const result = createVendorSchema.safeParse({
      name: "ABC Concrete Supply",
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing name", () => {
    const result = createVendorSchema.safeParse({
      email: "sales@abcconcrete.com",
    });
    expect(result.success).toBe(false);
  });

  it("phone is optional", () => {
    const result = createVendorSchema.safeParse({
      name: "ABC Concrete Supply",
      email: "sales@abcconcrete.com",
    });
    expect(result.success).toBe(true);
  });
});

describe("updateVendorSchema", () => {
  it("accepts a partial update with just phone", () => {
    const result = updateVendorSchema.safeParse({ phone: "555-0100" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email on update", () => {
    const result = updateVendorSchema.safeParse({ email: "nope" });
    expect(result.success).toBe(false);
  });

  it("accepts an empty update object", () => {
    const result = updateVendorSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
