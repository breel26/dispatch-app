import Link from "next/link";
import { notFound } from "next/navigation";
import { getPurchaseOrderById } from "@/modules/procurement/repository";
import { listMaterials, listEquipment } from "@/modules/inventory/repository";
import IssuePOButton from "./IssuePOButton";
import styles from "../../detail.module.css";

export const dynamic = "force-dynamic";

interface PurchaseOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PurchaseOrderDetailPage({ params }: PurchaseOrderDetailPageProps) {
  const { id } = await params;
  const po = await getPurchaseOrderById(id);
  if (!po) notFound();

  const [materials, equipment] = await Promise.all([listMaterials(), listEquipment()]);
  const materialsById = new Map(materials.map((m) => [m.id, m]));
  const equipmentById = new Map(equipment.map((e) => [e.id, e]));

  function lineItemLabel(item: NonNullable<typeof po>["lineItems"][number]): string {
    if (item.materialId) return materialsById.get(item.materialId)?.name ?? item.materialId;
    if (item.equipmentId) return equipmentById.get(item.equipmentId)?.name ?? item.equipmentId;
    return "—";
  }

  const total = po.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  return (
    <div>
      <div className={styles.headerRow}>
        <div>
          <h1>{po.poNumber}</h1>
          <p className={styles.meta}>
            {po.vendor.name} · {po.job.name}
          </p>
        </div>
      </div>

      <p>Status: {po.status}</p>
      {po.issuedAt && <p className={styles.meta}>Issued: {po.issuedAt.toLocaleDateString()}</p>}

      {po.status === "DRAFT" && (
        <div className={styles.section}>
          <IssuePOButton purchaseOrderId={po.id} />
        </div>
      )}

      <div className={styles.section}>
        <h2>Line Items</h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Item</th>
              <th style={{ textAlign: "left" }}>Quantity</th>
              <th style={{ textAlign: "left" }}>Unit Price</th>
              <th style={{ textAlign: "left" }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {po.lineItems.map((item) => (
              <tr key={item.id}>
                <td>{lineItemLabel(item)}</td>
                <td>{item.quantity}</td>
                <td>${item.unitPrice.toFixed(2)}</td>
                <td>${(item.quantity * item.unitPrice).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: "0.5rem", fontWeight: 600 }}>Total: ${total.toFixed(2)}</p>
      </div>

      <p className={styles.meta}>
        <Link href={`/jobs/${po.jobId}`}>Back to job</Link>
      </p>
    </div>
  );
}
