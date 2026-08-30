import Link from "next/link";
import { notFound } from "next/navigation";
import { getMaterialById } from "@/modules/inventory/repository";
import { checkStockLevel } from "@/modules/inventory/stockLevels";
import AdjustQuantityForm from "./AdjustQuantityForm";
import styles from "../../detail.module.css";

export const dynamic = "force-dynamic";

interface MaterialDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function MaterialDetailPage({ params }: MaterialDetailPageProps) {
  const { id } = await params;
  const material = await getMaterialById(id);
  if (!material) notFound();

  const stock = checkStockLevel(material);

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
    </div>
  );
}
