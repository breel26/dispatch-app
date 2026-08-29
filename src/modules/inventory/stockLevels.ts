export interface StockLevel {
  id: string;
  sku: string;
  name: string;
  quantityOnHand: number;
  reorderThreshold?: number | null;
}

export interface StockCheckResult extends StockLevel {
  isLowStock: boolean;
  isOutOfStock: boolean;
}

// A material with no reorderThreshold set is never flagged low-stock —
// that's a deliberate opt-in, not a default of 0, since a threshold of
// 0 would mean "only warn once we're completely out," which is usually
// not what's intended when a threshold was simply never configured.
export function checkStockLevel(material: StockLevel): StockCheckResult {
  const isOutOfStock = material.quantityOnHand <= 0;
  const isLowStock =
    !isOutOfStock &&
    material.reorderThreshold != null &&
    material.quantityOnHand <= material.reorderThreshold;

  return { ...material, isLowStock, isOutOfStock };
}

export function findLowStockMaterials(materials: StockLevel[]): StockCheckResult[] {
  return materials
    .map(checkStockLevel)
    .filter((m) => m.isLowStock || m.isOutOfStock);
}

// Given a desired quantity for a job, checks whether current stock can
// cover it without going negative. Does not mutate anything — this is
// a pure availability check used before creating an Assignment; the
// actual deduction happens via adjustMaterialQuantity in repository.ts.
export function hasSufficientStock(
  material: StockLevel,
  requestedQuantity: number
): boolean {
  if (requestedQuantity <= 0) {
    throw new Error("requestedQuantity must be greater than 0");
  }
  return material.quantityOnHand >= requestedQuantity;
}
