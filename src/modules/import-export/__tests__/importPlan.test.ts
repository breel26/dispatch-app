import { describe, it, expect } from "vitest";
import { planImport, type PlannedRow } from "../importPlan";
import type { ValidRow } from "../rows";
import { nextEquipmentNumber, parseEquipmentNumber } from "@/modules/inventory/equipmentNumber";
import { nextEmployeeId } from "@/modules/inventory/employeeId";

interface Machine {
  equipmentNumber: string;
  label: string;
}

function rows(...machines: Machine[]): ValidRow<Machine>[] {
  return machines.map((data, index) => ({ row: index + 1, data }));
}

function planMachines(
  incoming: ValidRow<Machine>[],
  existing: { key: string; label: string }[] = []
): PlannedRow<Machine>[] {
  return planImport<Machine>({
    rows: incoming,
    keyOf: (row) => row.equipmentNumber,
    describeRow: (row) => row.label,
    existing,
    suggest: (row, taken) => {
      const parts = parseEquipmentNumber(row.equipmentNumber);
      if (!parts) return null;
      return nextEquipmentNumber(taken, parts.type, parts.capacity);
    },
  });
}

describe("planImport", () => {
  it("marks a row with a free number as having no clash", () => {
    const plan = planMachines(rows({ equipmentNumber: "03-05-0009", label: "Cat 336" }));

    expect(plan).toHaveLength(1);
    expect(plan[0].clash).toBeNull();
    expect(plan[0].row).toBe(1);
    expect(plan[0].key).toBe("03-05-0009");
  });

  it("flags a number already in the database and suggests the next free one", () => {
    const plan = planMachines(rows({ equipmentNumber: "03-05-0002", label: "Cat 336" }), [
      { key: "03-05-0001", label: "Deere 350" },
      { key: "03-05-0002", label: "Komatsu PC210" },
    ]);

    expect(plan[0].clash).toEqual({
      source: "database",
      heldBy: "Komatsu PC210",
      suggestion: "03-05-0003",
      likelyDifferent: true,
    });
  });

  it("treats a matching description as a likely re-import rather than a collision", () => {
    // Re-importing a corrected export is the legitimate case, and it must
    // not be dressed up as a suspicious clash - that is what keeps a large
    // re-import to a single click.
    const plan = planMachines(rows({ equipmentNumber: "03-05-0002", label: "Komatsu PC210" }), [
      { key: "03-05-0002", label: "Komatsu PC210" },
    ]);

    expect(plan[0].clash?.likelyDifferent).toBe(false);
  });

  it("catches the same number appearing twice in one file", () => {
    const plan = planMachines(
      rows(
        { equipmentNumber: "03-05-0004", label: "Cat 336" },
        { equipmentNumber: "03-05-0004", label: "Deere 350" }
      )
    );

    expect(plan[0].clash).toBeNull();
    expect(plan[1].clash).toMatchObject({
      source: "file",
      heldBy: "row 1",
      // Always suspicious: one spreadsheet listing a number twice is a
      // mistake whatever the rows say.
      likelyDifferent: true,
    });
  });

  it("reports a within-file duplicate as such even when the database also holds the number", () => {
    const plan = planMachines(
      rows(
        { equipmentNumber: "03-05-0004", label: "Cat 336" },
        { equipmentNumber: "03-05-0004", label: "Deere 350" }
      ),
      [{ key: "03-05-0004", label: "Volvo EC220" }]
    );

    expect(plan[0].clash?.source).toBe("database");
    expect(plan[1].clash?.source).toBe("file");
  });

  it("never suggests the same number twice within one batch", () => {
    // Two different machines both colliding in 03-05. Offering 0003 to
    // both would just move the collision instead of resolving it.
    const plan = planMachines(
      rows(
        { equipmentNumber: "03-05-0002", label: "Cat 336" },
        { equipmentNumber: "03-05-0002", label: "Deere 350" },
        { equipmentNumber: "03-05-0002", label: "Volvo EC220" }
      ),
      [{ key: "03-05-0002", label: "Komatsu PC210" }]
    );

    const suggestions = plan.map((planned) => planned.clash?.suggestion);
    expect(suggestions).toEqual(["03-05-0003", "03-05-0004", "03-05-0005"]);
  });

  it("does not suggest a number a later row in the same file already claims", () => {
    // Row 1 collides; row 2 is clean and holds 03-05-0003. Suggesting
    // 0003 to row 1 would break row 2 on commit.
    const plan = planMachines(
      rows(
        { equipmentNumber: "03-05-0002", label: "Cat 336" },
        { equipmentNumber: "03-05-0003", label: "Deere 350" }
      ),
      [
        { key: "03-05-0002", label: "Komatsu PC210" },
        { key: "03-05-0003", label: "Volvo EC220" },
      ]
    );

    expect(plan[0].clash?.suggestion).toBe("03-05-0004");
  });

  it("suggests within the row's own type and capacity family", () => {
    const plan = planMachines(rows({ equipmentNumber: "08-11-0001", label: "Grove RT765" }), [
      { key: "08-11-0001", label: "Link-Belt HTC" },
      // A crowded excavator family must not push the crane suggestion up.
      { key: "03-05-0500", label: "Cat 336" },
    ]);

    expect(plan[0].clash?.suggestion).toBe("08-11-0002");
  });

  it("reports no suggestion when the family is exhausted", () => {
    const plan = planMachines(rows({ equipmentNumber: "03-05-0001", label: "Cat 336" }), [
      { key: "03-05-0001", label: "Komatsu PC210" },
      { key: "03-05-9999", label: "The last one" },
    ]);

    expect(plan[0].clash?.suggestion).toBeNull();
  });

  it("keeps the spreadsheet row number, not the position in the valid list", () => {
    // Rows 2 and 4 failed validation and never reach the planner. The
    // survivors must still report the row a dispatcher would count, since
    // decisions are keyed by it.
    const incoming: ValidRow<Machine>[] = [
      { row: 1, data: { equipmentNumber: "03-05-0001", label: "Cat 336" } },
      { row: 3, data: { equipmentNumber: "03-05-0002", label: "Deere 350" } },
      { row: 5, data: { equipmentNumber: "03-05-0002", label: "Volvo EC220" } },
    ];

    const plan = planMachines(incoming);

    expect(plan.map((planned) => planned.row)).toEqual([1, 3, 5]);
    expect(plan[2].clash?.heldBy).toBe("row 3");
  });

  it("plans employee ids with the same reservation behavior", () => {
    const plan = planImport<{ employeeId: string; name: string }>({
      rows: [
        { row: 1, data: { employeeId: "000002", name: "Jamie Rivera" } },
        { row: 2, data: { employeeId: "000002", name: "Alex Chen" } },
      ],
      keyOf: (row) => row.employeeId,
      describeRow: (row) => row.name,
      existing: [
        { key: "000001", label: "Sam Okafor" },
        { key: "000002", label: "Dana Brooks" },
      ],
      suggest: (_row, taken) => nextEmployeeId(taken),
    });

    expect(plan[0].clash?.suggestion).toBe("000003");
    expect(plan[1].clash?.suggestion).toBe("000004");
    expect(plan[1].clash?.source).toBe("file");
  });
});
