import { describe, it, expect } from "vitest";
import { nextEmployeeId } from "../employeeId";

describe("nextEmployeeId", () => {
  it("starts at 000001 when nobody has a number yet", () => {
    expect(nextEmployeeId([])).toBe("000001");
  });

  it("takes the highest in use plus one, padded", () => {
    expect(nextEmployeeId(["000001", "000002", "000003"])).toBe("000004");
  });

  it("does not fill gaps left by workers who have left", () => {
    expect(nextEmployeeId(["000001", "000002", "000009"])).toBe("000010");
  });

  it("keeps the extra width once numbers outgrow six digits", () => {
    expect(nextEmployeeId(["000001", "9999999"])).toBe("10000000");
  });

  it("skips values that are not plain digit strings", () => {
    expect(nextEmployeeId(["", "JM-14", "000007"])).toBe("000008");
  });

  it("does not lose precision on badge numbers too long for a float", () => {
    // The reason this module exists. Number("100000000000000001") and
    // Number("100000000000000002") are the same float, so a Number-based
    // maximum would pick the wrong one and suggest an id already issued.
    const existing = ["100000000000000001", "100000000000000002"];
    expect(nextEmployeeId(existing)).toBe("100000000000000003");
  });

  it("accepts a Set, so a caller can pass what is taken so far in a batch", () => {
    expect(nextEmployeeId(new Set(["000001", "000002"]))).toBe("000003");
  });
});
