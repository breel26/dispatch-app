import { describe, it, expect } from "vitest";
import { createEquipmentSchema, updateEquipmentSchema } from "../schemas";

const VALID = {
  equipmentNumber: "03-07-0001",
  name: "Company Owned",
  type: "336 Excavator",
  make: "Caterpillar",
  model: "336",
  operatingHours: 120,
  requiredCertifications: ["Heavy Equipment Operator"],
  status: "AVAILABLE",
};

describe("createEquipmentSchema", () => {
  it("accepts a complete piece of equipment", () => {
    expect(createEquipmentSchema.safeParse(VALID).success).toBe(true);
  });

  it("normalizes an equipment number missing its dashes", () => {
    const result = createEquipmentSchema.parse({ ...VALID, equipmentNumber: "03070001" });
    expect(result.equipmentNumber).toBe("03-07-0001");
  });

  it("refuses an equipment number naming an unregistered type or capacity code", () => {
    expect(
      createEquipmentSchema.safeParse({ ...VALID, equipmentNumber: "99-07-0001" }).success
    ).toBe(false);
    expect(
      createEquipmentSchema.safeParse({ ...VALID, equipmentNumber: "03-99-0001" }).success
    ).toBe(false);
  });

  it("refuses an equipment number with the wrong shape", () => {
    // Dash placement is tolerated (normalizeEquipmentNumberInput strips and
    // rejoins them) - what must not be tolerated is the wrong digit count.
    expect(createEquipmentSchema.safeParse({ ...VALID, equipmentNumber: "030700012" }).success).toBe(
      false
    );
    expect(createEquipmentSchema.safeParse({ ...VALID, equipmentNumber: "0307001" }).success).toBe(
      false
    );
    expect(createEquipmentSchema.safeParse({ ...VALID, equipmentNumber: "" }).success).toBe(false);
  });

  it("requires make and model", () => {
    expect(createEquipmentSchema.safeParse({ ...VALID, make: "" }).success).toBe(false);
    expect(createEquipmentSchema.safeParse({ ...VALID, model: "" }).success).toBe(false);
  });

  // 0 is a real, honest value for equipment that has genuinely never been
  // used - unlike the migration backfill for equipment already in
  // service, which left this null rather than claim a false 0.
  it("defaults operating hours to 0 for newly created equipment", () => {
    const { operatingHours, ...rest } = VALID;
    void operatingHours;
    const result = createEquipmentSchema.parse(rest);
    expect(result.operatingHours).toBe(0);
  });

  it("refuses negative operating hours", () => {
    expect(createEquipmentSchema.safeParse({ ...VALID, operatingHours: -1 }).success).toBe(false);
  });

  it("defaults required certifications to an empty list", () => {
    const { requiredCertifications, ...rest } = VALID;
    void requiredCertifications;
    const result = createEquipmentSchema.parse(rest);
    expect(result.requiredCertifications).toEqual([]);
  });

  it("defaults status to AVAILABLE", () => {
    const { status, ...rest } = VALID;
    void status;
    const result = createEquipmentSchema.parse(rest);
    expect(result.status).toBe("AVAILABLE");
  });
});

describe("updateEquipmentSchema", () => {
  it("allows a partial update touching only one field", () => {
    expect(updateEquipmentSchema.safeParse({ operatingHours: 500 }).success).toBe(true);
  });

  it("still validates the equipment number format when one is supplied", () => {
    expect(updateEquipmentSchema.safeParse({ equipmentNumber: "not-a-number" }).success).toBe(
      false
    );
    expect(updateEquipmentSchema.safeParse({ equipmentNumber: "08-10-0042" }).success).toBe(true);
  });

  it("does not require operating hours or certifications when omitted", () => {
    expect(updateEquipmentSchema.safeParse({ name: "New Name" }).success).toBe(true);
  });
});
