import { describe, it, expect } from "vitest";
import { nextEquipmentNumber, EQUIPMENT_SEQUENCE_MAX } from "../equipmentNumber";

describe("nextEquipmentNumber", () => {
  it("starts a family at 0001 when nothing in it is in use", () => {
    expect(nextEquipmentNumber([], "03", "05")).toBe("03-05-0001");
  });

  it("takes the highest sequence plus one", () => {
    const existing = ["03-05-0001", "03-05-0002", "03-05-0003"];
    expect(nextEquipmentNumber(existing, "03", "05")).toBe("03-05-0004");
  });

  it("does not fill gaps left by retired equipment", () => {
    // The point of the rule: 0004-0006 were scrapped, and their numbers are
    // still on old POs and delivery tickets. A new machine gets 0008.
    const existing = ["03-05-0001", "03-05-0002", "03-05-0003", "03-05-0007"];
    expect(nextEquipmentNumber(existing, "03", "05")).toBe("03-05-0008");
  });

  it("ignores numbers from other type and capacity families", () => {
    // Sequences are only unique within a type+capacity pair, so a busy
    // 01-02 family says nothing about what is free in 03-05.
    const existing = ["01-02-0044", "03-04-0100", "04-05-0090", "03-05-0002"];
    expect(nextEquipmentNumber(existing, "03", "05")).toBe("03-05-0003");
  });

  it("skips values that are not canonical equipment numbers", () => {
    const existing = ["", "not a number", "3-5-1", "03-05-0002"];
    expect(nextEquipmentNumber(existing, "03", "05")).toBe("03-05-0003");
  });

  it("returns null when the family is exhausted", () => {
    const existing = [`03-05-${String(EQUIPMENT_SEQUENCE_MAX)}`];
    expect(nextEquipmentNumber(existing, "03", "05")).toBeNull();
  });

  it("accepts a Set, so a caller can pass what is taken so far in a batch", () => {
    const taken = new Set(["03-05-0001", "03-05-0002"]);
    expect(nextEquipmentNumber(taken, "03", "05")).toBe("03-05-0003");
  });
});
