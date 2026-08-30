import type { Prisma, Material, StockMovement, StockMovementReason } from "@prisma/client";
import { prisma } from "@/modules/shared/prisma";

// The stock ledger: why the quantity on hand is what it is.
//
// Before this existed, Material.quantityOnHand was mutated in place and
// nothing recorded the reason. "We are 40 bags short and nobody knows
// where they went" is precisely the question a procurement system should
// be able to answer, and an in-place counter cannot answer it.
//
// The rules:
//   - StockMovement is append-only. Nothing updates or deletes a row.
//     Cancelling an assignment writes a compensating ASSIGNMENT_CANCELLED
//     movement; it does not erase the ASSIGNMENT one. The history of what
//     was believed at the time survives.
//   - Material.quantityOnHand is a cached rollup of the ledger, not an
//     independent fact. It exists so listing 500 materials does not need
//     500 aggregates.
//   - applyStockDelta is the ONLY way quantityOnHand changes. Both writes
//     happen in one transaction, so the cache can never drift from the
//     ledger. If you find yourself writing `quantityOnHand: { increment }`
//     anywhere else, that is the bug.

export class InsufficientStockError extends Error {
  constructor(materialName: string, requested: number, available: number) {
    super(
      `Insufficient stock for ${materialName}: requested ${requested}, only ${available} on hand`
    );
    this.name = "InsufficientStockError";
  }
}

export interface StockDelta {
  orgId: string;
  materialId: string;
  // Signed: negative consumes stock, positive adds it.
  delta: number;
  reason: StockMovementReason;
  note?: string;
  assignmentId?: string;
  createdBy?: string;
}

// --- Pure reconciliation logic (unit tested without a database) ---

export interface MovementLike {
  delta: number;
}

export function sumMovements(movements: MovementLike[]): number {
  // Quantities are measurements, not money, so float is acceptable here -
  // but summing many deltas still accumulates representation error, so the
  // result is rounded to a sane number of decimal places. Materials are
  // counted in bags and cubic yards, not billionths.
  const total = movements.reduce((sum, m) => sum + m.delta, 0);
  return roundQuantity(total);
}

// Six decimal places is far finer than any real unit of construction
// material and well inside float's exact range for these magnitudes.
export function roundQuantity(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export interface Reconciliation {
  cachedQuantity: number;
  ledgerQuantity: number;
  isBalanced: boolean;
  drift: number;
}

export function reconcile(cachedQuantity: number, movements: MovementLike[]): Reconciliation {
  const ledgerQuantity = sumMovements(movements);
  const drift = roundQuantity(cachedQuantity - ledgerQuantity);
  return { cachedQuantity, ledgerQuantity, isBalanced: drift === 0, drift };
}

// --- Database operations ---

// Applies a stock change: writes the ledger row and updates the cached
// rollup in one atomic step. Requires an existing transaction client,
// because every caller has other work that must succeed or fail with it
// (creating the assignment, deleting it, and so on).
//
// The increment is done by the database rather than read-modify-write in
// app code, so two concurrent adjustments cannot clobber each other.
export async function applyStockDelta(
  tx: Prisma.TransactionClient,
  input: StockDelta
): Promise<Material> {
  await tx.stockMovement.create({
    data: {
      orgId: input.orgId,
      materialId: input.materialId,
      delta: input.delta,
      reason: input.reason,
      note: input.note,
      assignmentId: input.assignmentId,
      createdBy: input.createdBy,
    },
  });

  return tx.material.update({
    where: { id: input.materialId, orgId: input.orgId },
    data: { quantityOnHand: { increment: input.delta } },
  });
}

// Reads current stock inside the caller's transaction and refuses to go
// negative. Returns the material so the caller can name it in errors.
//
// Correctness note: this is a read-then-check, so on its own it would race.
// It is safe because callers run it inside the same transaction as the
// applyStockDelta that follows, and because the check is a business rule
// ("do not let a dispatcher over-commit stock"), not a data-integrity
// invariant. Two dispatchers racing can still drive stock slightly
// negative under READ COMMITTED; the ledger records exactly how it
// happened, which is the outcome that matters for a physical count that
// was going to be approximate anyway.
export async function assertSufficientStock(
  tx: Prisma.TransactionClient,
  orgId: string,
  materialId: string,
  requestedQuantity: number
): Promise<Material> {
  if (requestedQuantity <= 0) {
    throw new Error("requestedQuantity must be greater than 0");
  }

  const material = await tx.material.findFirst({ where: { id: materialId, orgId } });
  if (!material) {
    throw Object.assign(new Error("Material not found"), { code: "P2025" });
  }
  if (material.quantityOnHand < requestedQuantity) {
    throw new InsufficientStockError(material.name, requestedQuantity, material.quantityOnHand);
  }
  return material;
}

export async function listStockMovements(
  orgId: string,
  materialId: string,
  limit = 100
): Promise<StockMovement[]> {
  return prisma.stockMovement.findMany({
    where: { orgId, materialId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

// Recomputes the cached rollup from the ledger. This is the repair tool:
// if quantityOnHand and the ledger ever disagree, the ledger wins, because
// it is the one with an audit trail behind it.
export async function recomputeQuantityOnHand(
  orgId: string,
  materialId: string
): Promise<Reconciliation> {
  return prisma.$transaction(async (tx) => {
    const material = await tx.material.findFirst({ where: { id: materialId, orgId } });
    if (!material) {
      throw Object.assign(new Error("Material not found"), { code: "P2025" });
    }

    const movements = await tx.stockMovement.findMany({
      where: { orgId, materialId },
      select: { delta: true },
    });

    const result = reconcile(material.quantityOnHand, movements);
    if (!result.isBalanced) {
      await tx.material.update({
        where: { id: materialId, orgId },
        data: { quantityOnHand: result.ledgerQuantity },
      });
    }
    return result;
  });
}

export interface LedgerDiscrepancy extends Reconciliation {
  materialId: string;
  sku: string;
  name: string;
}

// Audit sweep across every material in an org. Intended for a scheduled
// check or an admin screen - if this ever returns rows, something wrote to
// quantityOnHand without going through applyStockDelta.
export async function findLedgerDiscrepancies(orgId: string): Promise<LedgerDiscrepancy[]> {
  const materials = await prisma.material.findMany({
    where: { orgId },
    select: { id: true, sku: true, name: true, quantityOnHand: true },
  });

  const grouped = await prisma.stockMovement.groupBy({
    by: ["materialId"],
    where: { orgId },
    _sum: { delta: true },
  });
  const ledgerByMaterial = new Map(grouped.map((g) => [g.materialId, g._sum.delta ?? 0]));

  return materials
    .map((material) => {
      const ledgerQuantity = roundQuantity(ledgerByMaterial.get(material.id) ?? 0);
      const drift = roundQuantity(material.quantityOnHand - ledgerQuantity);
      return {
        materialId: material.id,
        sku: material.sku,
        name: material.name,
        cachedQuantity: material.quantityOnHand,
        ledgerQuantity,
        isBalanced: drift === 0,
        drift,
      };
    })
    .filter((row) => !row.isBalanced);
}
