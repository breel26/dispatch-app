import { describe, it, expect } from "vitest";
import {
  EQUIPMENT_TYPE_CODES,
  EQUIPMENT_CAPACITY_CODES,
  EQUIPMENT_TYPE_OPTIONS,
  EQUIPMENT_CAPACITY_OPTIONS,
  isEquipmentTypeCode,
  isEquipmentCapacityCode,
  formatEquipmentNumber,
  parseEquipmentNumber,
  normalizeEquipmentNumberInput,
} from "../equipmentNumber";

describe("registries", () => {
  it("keeps the three type codes given at the start", () => {
    expect(EQUIPMENT_TYPE_CODES["01"]).toBe("Cars & Trucks");
    expect(EQUIPMENT_TYPE_CODES["02"]).toContain("forklifts");
    expect(EQUIPMENT_TYPE_CODES["03"]).toBe("Excavators");
  });

  it("reserves 00 in both registries for unclassified equipment", () => {
    expect(EQUIPMENT_TYPE_CODES["00"]).toBeDefined();
    expect(EQUIPMENT_CAPACITY_CODES["00"]).toBeDefined();
  });

  it("builds one dropdown option per registered code", () => {
    expect(EQUIPMENT_TYPE_OPTIONS).toHaveLength(Object.keys(EQUIPMENT_TYPE_CODES).length);
    expect(EQUIPMENT_CAPACITY_OPTIONS).toHaveLength(
      Object.keys(EQUIPMENT_CAPACITY_CODES).length
    );
  });
});

describe("isEquipmentTypeCode / isEquipmentCapacityCode", () => {
  it("accepts every registered code", () => {
    for (const code of Object.keys(EQUIPMENT_TYPE_CODES)) {
      expect(isEquipmentTypeCode(code)).toBe(true);
    }
    for (const code of Object.keys(EQUIPMENT_CAPACITY_CODES)) {
      expect(isEquipmentCapacityCode(code)).toBe(true);
    }
  });

  it("rejects a code that is not registered", () => {
    expect(isEquipmentTypeCode("99")).toBe(false);
    expect(isEquipmentCapacityCode("99")).toBe(false);
    expect(isEquipmentTypeCode("1")).toBe(false); // not zero-padded
  });
});

describe("formatEquipmentNumber", () => {
  it("joins the three parts with dashes", () => {
    expect(formatEquipmentNumber({ type: "03", capacity: "07", sequence: "0001" })).toBe(
      "03-07-0001"
    );
  });

  it("pads a short sequence to four digits", () => {
    expect(formatEquipmentNumber({ type: "01", capacity: "01", sequence: "7" })).toBe(
      "01-01-0007"
    );
  });
});

describe("parseEquipmentNumber", () => {
  it("splits a canonical number back into its parts", () => {
    expect(parseEquipmentNumber("08-10-0042")).toEqual({
      type: "08",
      capacity: "10",
      sequence: "0042",
    });
  });

  it("rejects a value with the wrong shape", () => {
    expect(parseEquipmentNumber("8-10-0042")).toBeNull(); // not zero-padded
    expect(parseEquipmentNumber("08100042")).toBeNull(); // missing dashes
    expect(parseEquipmentNumber("08-10-42")).toBeNull(); // sequence too short
  });

  // The shape can be right while the codes it names are not real - this
  // is what stops "99-99-0001" from being accepted as though 99 meant
  // something.
  it("rejects a well-shaped number naming an unregistered code", () => {
    expect(parseEquipmentNumber("99-01-0001")).toBeNull();
    expect(parseEquipmentNumber("01-99-0001")).toBeNull();
  });
});

describe("normalizeEquipmentNumberInput", () => {
  it("accepts the canonical form unchanged", () => {
    expect(normalizeEquipmentNumberInput("03-07-0001")).toBe("03-07-0001");
  });

  // Tolerates the same kind of typing shortcuts normalizePoNumberInput
  // and normalizeEmployeeIdInput already tolerate for their own codes.
  it("tolerates missing dashes and surrounding whitespace", () => {
    expect(normalizeEquipmentNumberInput("03070001")).toBe("03-07-0001");
    expect(normalizeEquipmentNumberInput("  03-07-0001  ")).toBe("03-07-0001");
  });

  it("rejects anything that is not exactly eight digits", () => {
    expect(normalizeEquipmentNumberInput("0307001")).toBeNull(); // 7 digits
    expect(normalizeEquipmentNumberInput("030700012")).toBeNull(); // 9 digits
    expect(normalizeEquipmentNumberInput("ab-07-0001")).toBeNull();
    expect(normalizeEquipmentNumberInput("")).toBeNull();
  });

  it("rejects eight digits naming a type or capacity code that does not exist", () => {
    expect(normalizeEquipmentNumberInput("99-01-0001")).toBeNull();
    expect(normalizeEquipmentNumberInput("01-99-0001")).toBeNull();
  });
});
