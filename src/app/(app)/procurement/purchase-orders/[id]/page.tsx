import Link from "next/link";
import { notFound } from "next/navigation";
import { getPurchaseOrderById } from "@/modules/procurement/repository";
import { formatMoney, lineTotal, sumLineTotals } from "@/modules/shared/money";
import IssuePOButton from "./IssuePOButton";
import styles from "../../detail.module.css";
import { requireAuthContext } from "@/modules/shared/currentUser";

export const dynamic = "force-dynamic";

interface PurchaseOrderDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PurchaseOrderDetailPage({ params }: PurchaseOrderDetailPageProps) {
  const { orgId } = await requireAuthContext();
  const { id } = await params;
  const po = await getPurchaseOrderById(orgId, id);
  if (!po) notFound();

  // The line items arrive with their material/equipment already joined, so
  // there is no need to load the whole catalogue just to label a few rows.
  function lineItemLabel(item: NonNullable<typeof po>["lineItems"][number]): string {
    return item.material?.name ?? item.equipment?.name ?? "—";
  }

  // Decimal arithmetic, not floats: each line is extended and rounded to
  // cents, then the lines are summed — the same order an invoice is
  // totalled in, so this figure matches what the vendor bills.
  const total = sumLineTotals(po.lineItems);

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
        <table className={styles.dataTable}>
          <thead>
            <tr>
              <th>Item</th>
              <th>Quantity</th>
              <th>Unit Price</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {po.lineItems.map((item) => (
              <tr key={item.id}>
                <td>{lineItemLabel(item)}</td>
                <td>{item.quantity}</td>
                <td>{formatMoney(item.unitPrice)}</td>
                <td>{formatMoney(lineTotal(item.quantity, item.unitPrice))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: "0.5rem", fontWeight: 600 }}>Total: {formatMoney(total)}</p>
      </div>

      <p className={styles.meta}>
        <Link href={`/jobs/${po.jobId}`}>Back to job</Link>
      </p>
    </div>
  );
}
