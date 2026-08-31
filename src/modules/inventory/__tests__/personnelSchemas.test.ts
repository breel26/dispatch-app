import { describe, it, expect } from "vitest";
import { createPersonnelSchema, updatePersonnelSchema } from "../schemas";
import { CRAFT_VALUES, CLASSIFICATION_VALUES } from "../craft";

const VALID = {
  employeeId: "000001",
  name: "dave eguiza",
  craft: "CARPENTER",
  classification: "JOURNEYMAN",
  certifications: ["OSHA-30"],
  isActive: true,
};

describe("createPersonnelSchema", () => {
  it("accepts a complete worker", () => {
    const result = createPersonnelSchema.safeParse(VALID);
    expect(result.success).toBe(true);
  });

  it("accepts every craft and classification the dropdown offers", () => {
    for (const craft of CRAFT_VALUES) {
      for (const classification of CLASSIFICATION_VALUES) {
        const result = createPersonnelSchema.safeParse({ ...VALID, craft, classification });
        expect(result.success).toBe(true);
      }
    }
  });

  // Both fields are required: replacing the old free-text `role` was the
  // point, so a worker without a trade must not be creatable.
  it("refuses a worker with no craft", () => {
    const result = createPersonnelSchema.safeParse({ ...VALID, craft: undefined });
    expect(result.success).toBe(false);
  });

  it("refuses a worker with no classification", () => {
    const result = createPersonnelSchema.safeParse({ ...VALID, classification: undefined });
    expect(result.success).toBe(false);
  });

  // The old `role` accepted anything typed into it, which is how
  // "JM Carpenter" ended up in the database.
  it("refuses a trade that is not on the list", () => {
    expect(createPersonnelSchema.safeParse({ ...VALID, craft: "WELDER" }).success).toBe(false);
    expect(createPersonnelSchema.safeParse({ ...VALID, craft: "JM Carpenter" }).success).toBe(
      false
    );
  });

  it("refuses the display label in place of the stored value", () => {
    // "Pipe Fitter" is what a person reads; PIPE_FITTER is what is stored.
    expect(createPersonnelSchema.safeParse({ ...VALID, craft: "Pipe Fitter" }).success).toBe(
      false
    );
  });

  it("explains what to do when a craft is missing", () => {
    const result = createPersonnelSchema.safeParse({ ...VALID, craft: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain("select a craft");
    }
  });

  it("still defaults certifications to empty and isActive to true", () => {
    const result = createPersonnelSchema.parse({
      employeeId: "000002",
      name: "Eric Fernando",
      craft: "CARPENTER",
      classification: "APPRENTICE",
    });
    expect(result.certifications).toEqual([]);
    expect(result.isActive).toBe(true);
  });

  // Normalization lives in the schema rather than at the call site, so no
  // write path can store "1" as a worker distinct from "000001".
  it("pads a short employee id to the stored form", () => {
    expect(createPersonnelSchema.parse({ ...VALID, employeeId: "7" }).employeeId).toBe("000007");
    expect(createPersonnelSchema.parse({ ...VALID, employeeId: " 42 " }).employeeId).toBe(
      "000042"
    );
  });

  it("refuses an employee id that is not a number", () => {
    expect(createPersonnelSchema.safeParse({ ...VALID, employeeId: "E1234" }).success).toBe(
      false
    );
    expect(createPersonnelSchema.safeParse({ ...VALID, employeeId: "" }).success).toBe(false);
    expect(createPersonnelSchema.safeParse({ ...VALID, employeeId: "000000" }).success).toBe(
      false
    );
  });

  it("refuses a worker with no employee id at all", () => {
    expect(createPersonnelSchema.safeParse({ ...VALID, employeeId: undefined }).success).toBe(
      false
    );
  });

  it("explains what an employee id should look like", () => {
    const result = createPersonnelSchema.safeParse({ ...VALID, employeeId: "abc" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain("000001");
    }
  });
});

describe("updatePersonnelSchema", () => {
  it("allows a partial update that touches neither field", () => {
    const result = updatePersonnelSchema.safeParse({ name: "New Name" });
    expect(result.success).toBe(true);
  });

  it("allows promoting an apprentice without restating their craft", () => {
    const result = updatePersonnelSchema.safeParse({ classification: "JOURNEYMAN" });
    expect(result.success).toBe(true);
  });

  // Optional must still mean "valid if present", not "unchecked".
  it("still rejects an invalid craft when one is supplied", () => {
    expect(updatePersonnelSchema.safeParse({ craft: "WELDER" }).success).toBe(false);
  });

  it("normalizes an employee id supplied on update, and rejects a bad one", () => {
    const result = updatePersonnelSchema.parse({ employeeId: "9" });
    expect(result.employeeId).toBe("000009");
    expect(updatePersonnelSchema.safeParse({ employeeId: "nope" }).success).toBe(false);
  });
});
