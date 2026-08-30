import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuoteRequestById } from "@/modules/procurement/repository";
import { itemKeyFor } from "@/modules/procurement/compareQuotes";
import { formatMoney, lineTotal, sumLineTotals } from "@/modules/shared/money";
import { requireAuthContext } from "@/modules/shared/currentUser";
import MarkSentButton from "./MarkSentButton";
import RecordQuoteForm, { type QuotedItemRow } from "./RecordQuoteForm";
import styles from "../../detail.module.css";

export const dynamic = "force-dynamic";

interface QuoteRequestDetailPageProps {
  params: Promise<{ id: string }>;
}

const EQUIPMENT_UNIT = "ea";

export default async function QuoteRequestDetailPage({ params }: QuoteRequestDetailPageProps) {
  const { orgId } = await requireAuthContext();
  const { id } = await params;
  const quoteRequest = await getQuoteRequestById(orgId, id);
  if (!quoteRequest) notFound();

  // Items arrive with their material/equipment joined, so labelling them
  // needs no extra catalogue query.
  const itemRows: QuotedItemRow[] = quoteRequest.items.map((item) => ({
    itemKey: itemKeyFor(item.materialId, item.equipmentId),
    label: item.material?.name ?? item.equipment?.name ?? "Unknown item",
    quantity: item.quantity,
    unit: item.material?.unit ?? EQUIPMENT_UNIT,
  }));

  const quote = quoteRequest.quote;
  const quoteTotal = quote ? sumLineTotals(quote.lineItems) : null;

  return (
    <div>
      <div className={styles.headerRow}>
        <div>
          <h1>Quote Request — {quoteRequest.vendor.name}</h1>
          <p className={styles.meta}>Status: {quoteRequest.status}</p>
        </div>
      </div>

      {quoteRequest.status === "DRAFT" && <MarkSentButton quoteRequestId={quoteRequest.id} />}

      <div className={styles.section}>
        <h2>Items requested</h2>
        <ul>
          {itemRows.map((item) => (
            <li key={item.itemKey}>
              {item.label} — quantity {item.quantity} {item.unit}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.section}>
        <h2>Quote</h2>
        {quote ? (
          <div>
            <table className={styles.dataTable}>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  <th>Extended</th>
                  <th>Lead time</th>
                </tr>
              </thead>
              <tbody>
                {quote.lineItems.map((line) => (
                  <tr key={line.id}>
                    <td>{line.material?.name ?? line.equipment?.name ?? "—"}</td>
                    <td>{line.quantity}</td>
                    <td>{formatMoney(line.unitPrice)}</td>
                    <td>{formatMoney(lineTotal(line.quantity, line.unitPrice))}</td>
                    <td>
                      {(line.leadTimeDays ?? quote.leadTimeDays) != null
                        ? `${line.leadTimeDays ?? quote.leadTimeDays} days`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {quoteTotal && (
              <p style={{ marginTop: "0.5rem", fontWeight: 600 }}>
                Quote total: {formatMoney(quoteTotal)}
              </p>
            )}
            {quote.expiresAt && <p>Expires: {quote.expiresAt.toLocaleDateString()}</p>}
            {quote.notes && <p className={styles.meta}>{quote.notes}</p>}
          </div>
        ) : (
          <RecordQuoteForm
            quoteRequestId={quoteRequest.id}
            vendorId={quoteRequest.vendorId}
            items={itemRows}
          />
        )}
      </div>

      <p className={styles.meta}>
        <Link href={`/jobs/${quoteRequest.jobId}`}>Back to job</Link>
      </p>
    </div>
  );
}
