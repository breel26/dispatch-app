import Link from "next/link";
import { notFound } from "next/navigation";
import { getMaterialById } from "@/modules/inventory/repository";
import { listStockMovements } from "@/modules/inventory/ledger";
import { checkStockLevel } from "@/modules/inventory/stockLevels";
import AdjustQuantityForm from "./AdjustQuantityForm";
import styles from "../../detail.module.css";
import { requireAuthContext } from "@/modules/shared/currentUser";

export const dynamic = "force-dynamic";

interface MaterialDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function MaterialDetailPage({ params }: MaterialDetailPageProps) {
  const { orgId } = await requireAuthContext();
  const { id } = await params;
  const material = await getMaterialById(orgId, id);
  if (!material) notFound();

  const stock = checkStockLevel(material);
  const movements = await listStockMovements(orgId, material.id, 50);

  return (
    <div>
      <div className={styles.headerRow}>
        <div>
          <h1>{material.name}</h1>
          <p className={styles.meta}>
            SKU {material.sku} · {material.unit}
          </p>
        </div>
        <Link href={`/inventory/materials/${material.id}/edit`} className={styles.editLink}>
          Edit
        </Link>
      </div>

      <p>
        On hand: {material.quantityOnHand} {material.unit}{" "}
        {stock.isOutOfStock ? (
          <span className={`${styles.badge} ${styles.badgeWarn}`}>Out of stock</span>
        ) : stock.isLowStock ? (
          <span className={`${styles.badge} ${styles.badgeWarn}`}>Low stock</span>
        ) : (
          <span className={styles.badge}>OK</span>
        )}
      </p>
      {material.reorderThreshold != null && (
        <p className={styles.meta}>Reorder threshold: {material.reorderThreshold}</p>
      )}

      <div className={styles.section}>
        <h2>Adjust Quantity</h2>
        <AdjustQuantityForm materialId={material.id} />
      </div>

      {/* The point of the ledger: every change to the quantity above has a
          row here saying where it came from. Without this the number is
          just an assertion. */}
      <div className={styles.section}>
        <h2>Stock History</h2>
        {movements.length === 0 ? (
          <p className={styles.meta}>No recorded movements yet.</p>
        ) : (
          <table className={styles.dataTable}>
            <thead>
              <tr>
                <th>When</th>
                <th>Change</th>
                <th>Reason</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td>{movement.createdAt.toLocaleString()}</td>
                  <td>
                    {movement.delta > 0 ? "+" : ""}
                    {movement.delta} {material.unit}
                  </td>
                  <td>{movement.reason.replaceAll("_", " ").toLowerCase()}</td>
                  <td>{movement.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
