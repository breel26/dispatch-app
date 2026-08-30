import { describe, it, expect, vi } from "vitest";
import { sumMovements, reconcile, roundQuantity, applyStockDelta } from "../ledger";

describe("sumMovements", () => {
  it("sums an opening balance and later movements", () => {
    expect(sumMovements([{ delta: 100 }, { delta: -25 }, { delta: 10 }])).toBe(85);
  });

  it("is zero for a material with no movements", () => {
    expect(sumMovements([])).toBe(0);
  });

  // Quantities are floats (they are measurements, not money), so a long run
  // of fractional deltas accumulates representation error. Rounding to six
  // decimal places is far finer than any real unit of material and keeps
  // the reconciliation from reporting phantom drift.
  it("does not report phantom drift from float accumulation", () => {
    const movements = Array.from({ length: 10 }, () => ({ delta: 0.1 }));
    expect(sumMovements(movements)).toBe(1);
  });

  it("preserves genuinely fractional quantities", () => {
    expect(sumMovements([{ delta: 3.5 }, { delta: -1.25 }])).toBe(2.25);
  });
});

describe("roundQuantity", () => {
  it("keeps six decimal places", () => {
    expect(roundQuantity(1.2345678)).toBe(1.234568);
  });

  it("leaves whole numbers alone", () => {
    expect(roundQuantity(42)).toBe(42);
  });
});

describe("reconcile", () => {
  it("reports a balanced material", () => {
    const result = reconcile(85, [{ delta: 100 }, { delta: -15 }]);

    expect(result.isBalanced).toBe(true);
    expect(result.drift).toBe(0);
    expect(result.ledgerQuantity).toBe(85);
  });

  // If this ever fires in production, something wrote to quantityOnHand
  // without going through applyStockDelta - which is the bug the ledger
  // exists to make visible.
  it("reports drift when the cached quantity disagrees with the ledger", () => {
    const result = reconcile(90, [{ delta: 100 }, { delta: -15 }]);

    expect(result.isBalanced).toBe(false);
    expect(result.drift).toBe(5);
    expect(result.ledgerQuantity).toBe(85);
  });

  it("reports negative drift when the cache is behind the ledger", () => {
    expect(reconcile(80, [{ delta: 85 }]).drift).toBe(-5);
  });

  it("treats a material with no movements and no stock as balanced", () => {
    expect(reconcile(0, []).isBalanced).toBe(true);
  });
});

describe("applyStockDelta", () => {
  // The invariant the whole ledger rests on: the movement row and the
  // cached rollup are written together, so the cache can never drift.
  it("writes the movement and updates the rollup in the same transaction", async () => {
    const create = vi.fn().mockResolvedValue({});
    const update = vi.fn().mockResolvedValue({ id: "mat-1" });

    await applyStockDelta(
      { stockMovement: { create }, material: { update } } as never,
      {
        orgId: "org-1",
        materialId: "mat-1",
        delta: -25,
        reason: "ASSIGNMENT",
        assignmentId: "a-1",
        createdBy: "user-1",
      }
    );

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orgId: "org-1",
        materialId: "mat-1",
        delta: -25,
        reason: "ASSIGNMENT",
        assignmentId: "a-1",
        createdBy: "user-1",
      }),
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "mat-1", orgId: "org-1" },
      data: { quantityOnHand: { increment: -25 } },
    });
  });

  // Read-modify-write in app code would let two concurrent adjustments
  // clobber each other; the database does the arithmetic instead.
  it("increments in the database rather than writing an absolute value", async () => {
    const update = vi.fn().mockResolvedValue({});

    await applyStockDelta(
      { stockMovement: { create: vi.fn().mockResolvedValue({}) }, material: { update } } as never,
      { orgId: "org-1", materialId: "mat-1", delta: 40, reason: "RECEIPT" }
    );

    expect(update.mock.calls[0][0].data).toEqual({ quantityOnHand: { increment: 40 } });
  });

  it("scopes the rollup update to the caller's org", async () => {
    const update = vi.fn().mockResolvedValue({});

    await applyStockDelta(
      { stockMovement: { create: vi.fn().mockResolvedValue({}) }, material: { update } } as never,
      { orgId: "org-1", materialId: "mat-1", delta: 1, reason: "ADJUSTMENT" }
    );

    expect(update.mock.calls[0][0].where).toEqual({ id: "mat-1", orgId: "org-1" });
  });
});
