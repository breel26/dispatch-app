import Link from "next/link";
import { listPurchaseOrders, listPurchaseOrdersForJob } from "@/modules/procurement/repository";
import styles from "../list.module.css";

export const dynamic = "force-dynamic";

interface PurchaseOrdersPageProps {
  searchParams: Promise<{ jobId?: string }>;
}

export default async function PurchaseOrdersPage({ searchParams }: PurchaseOrdersPageProps) {
  const { jobId } = await searchParams;
  const purchaseOrders = jobId ? await listPurchaseOrdersForJob(jobId) : await listPurchaseOrders();

  return (
    <div>
      <div className={styles.headerRow}>
        <h1>Purchase Orders</h1>
        <Link
          href={jobId ? `/procurement/purchase-orders/new?jobId=${jobId}` : "/procurement/purchase-orders/new"}
          className={styles.newButton}
        >
          New Purchase Order
        </Link>
      </div>

      {purchaseOrders.length === 0 ? (
        <p className={styles.empty}>No purchase orders found.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>PO Number</th>
              <th>Vendor</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {purchaseOrders.map((po) => (
              <tr key={po.id}>
                <td>
                  <Link href={`/procurement/purchase-orders/${po.id}`}>{po.poNumber}</Link>
                </td>
                <td>{po.vendor.name}</td>
                <td>
                  <span className={styles.badge}>{po.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
