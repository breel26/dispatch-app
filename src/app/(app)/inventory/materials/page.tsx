import Link from "next/link";
import { listMaterials } from "@/modules/inventory/repository";
import { checkStockLevel } from "@/modules/inventory/stockLevels";
import styles from "../list.module.css";
import { requireAuthContext } from "@/modules/shared/currentUser";

export const dynamic = "force-dynamic";

interface MaterialsPageProps {
  searchParams: Promise<{ lowStock?: string }>;
}

export default async function MaterialsPage({ searchParams }: MaterialsPageProps) {
  const { orgId } = await requireAuthContext();
  const { lowStock } = await searchParams;
  const showLowStockOnly = lowStock === "true";
  const materials = await listMaterials(orgId);
  // checkStockLevel's declared return type only carries StockLevel's
  // fields (not the full Material), so keep the original record
  // alongside it for fields like `unit` that aren't part of StockLevel.
  const withStockInfo = materials.map((material) => ({ material, stock: checkStockLevel(material) }));
  const rows = showLowStockOnly
    ? withStockInfo.filter((r) => r.stock.isLowStock || r.stock.isOutOfStock)
    : withStockInfo;

  return (
    <div>
      <div className={styles.headerRow}>
        <h1>Materials</h1>
        <Link href="/inventory/materials/new" className={styles.newButton}>
          New Material
        </Link>
      </div>

      <div className={styles.filters}>
        <Link href="/inventory/materials" className={!showLowStockOnly ? styles.active : undefined}>
          All
        </Link>
        <Link
          href="/inventory/materials?lowStock=true"
          className={showLowStockOnly ? styles.active : undefined}
        >
          Low stock
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className={styles.empty}>No materials found.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Unit</th>
              <th>On hand</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ material, stock }) => (
              <tr key={material.id}>
                <td>{material.sku}</td>
                <td>
                  <Link href={`/inventory/materials/${material.id}`}>{material.name}</Link>
                </td>
                <td>{material.unit}</td>
                <td>{material.quantityOnHand}</td>
                <td>
                  {stock.isOutOfStock ? (
                    <span className={`${styles.badge} ${styles.badgeWarn}`}>Out of stock</span>
                  ) : stock.isLowStock ? (
                    <span className={`${styles.badge} ${styles.badgeWarn}`}>Low stock</span>
                  ) : (
                    <span className={styles.badge}>OK</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
