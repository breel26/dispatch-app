import { describe, it, expect } from "vitest";
import {
  filterByNumber,
  ownersFor,
  typesFor,
  unitsFor,
  equipmentOptionLabel,
  type EquipmentUnitOption,
} from "../equipmentPicker";

const units: EquipmentUnitOption[] = [
  { id: "1", number: "03-04-0001", owner: "Company Owned", type: "Excavators" },
  { id: "2", number: "03-04-0002", owner: "Company Owned", type: "Excavators" },
  { id: "3", number: "07-02-0001", owner: "Company Owned", type: "Backhoe Loaders" },
  { id: "4", number: "03-04-0001", owner: "ABC Rentals", type: "Excavators" },
];

describe("filterByNumber", () => {
  it("returns everything for an empty query", () => {
    expect(filterByNumber(units, "")).toHaveLength(4);
    expect(filterByNumber(units, "   ")).toHaveLength(4);
  });

  it("matches by substring, case-insensitively", () => {
    expect(filterByNumber(units, "0002")).toEqual([units[1]]);
    expect(filterByNumber(units, "03-04")).toHaveLength(3);
  });

  it("returns nothing when no fleet number matches", () => {
    expect(filterByNumber(units, "99-99-9999")).toEqual([]);
  });
});

describe("ownersFor", () => {
  it("returns unique owners, sorted", () => {
    expect(ownersFor(units)).toEqual(["ABC Rentals", "Company Owned"]);
  });
});

describe("typesFor", () => {
  it("returns unique types for one owner, sorted", () => {
    expect(typesFor(units, "Company Owned")).toEqual(["Backhoe Loaders", "Excavators"]);
  });

  it("returns nothing for an owner with no units", () => {
    expect(typesFor(units, "Nobody")).toEqual([]);
  });
});

describe("unitsFor", () => {
  it("narrows to exactly the owner+type pair", () => {
    expect(unitsFor(units, "Company Owned", "Excavators")).toEqual([units[0], units[1]]);
  });

  it("keeps owner and rental vendor units of the same type separate", () => {
    expect(unitsFor(units, "ABC Rentals", "Excavators")).toEqual([units[3]]);
  });
});

describe("equipmentOptionLabel", () => {
  it("puts the fleet number first", () => {
    expect(equipmentOptionLabel(units[0])).toBe("03-04-0001 — Company Owned — Excavators");
  });
});
