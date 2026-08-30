import Link from "next/link";
import { notFound } from "next/navigation";
import { getJobById } from "@/modules/jobs/repository";
import { listQuoteRequestsForJob } from "@/modules/procurement/repository";
import { rankQuotes, type ComparableQuote } from "@/modules/procurement/compareQuotes";
import styles from "../../../list.module.css";

export const dynamic = "force-dynamic";

interface ComparePageProps {
  params: Promise<{ jobId: string }>;
}

export default async function CompareQuotesPage({ params }: ComparePageProps) {
  const { jobId } = await params;
  const job = await getJobById(jobId);
  if (!job) notFound();

  const quoteRequests = await listQuoteRequestsForJob(jobId);
  const comparable: ComparableQuote[] = quoteRequests
    .filter((qr) => qr.quote)
    .map((qr) => ({
      id: qr.quote!.id,
      vendorId: qr.quote!.vendorId,
      vendorName: qr.vendor.name,
      price: qr.quote!.price,
      leadTimeDays: qr.quote!.leadTimeDays,
      expiresAt: qr.quote!.expiresAt,
    }));

  const ranked = rankQuotes(comparable);
  const best = ranked.find((q) => !q.isExpired);

  return (
    <div>
      <h1>Compare Quotes — {job.name}</h1>

      {ranked.length === 0 ? (
        <p className={styles.empty}>No quotes recorded for this job yet.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Vendor</th>
              <th>Price</th>
              <th>Lead time</th>
              <th>Expires</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((q) => (
              <tr key={q.id}>
                <td>{q.rank}</td>
                <td>{q.vendorName}</td>
                <td>${q.price.toFixed(2)}</td>
                <td>{q.leadTimeDays != null ? `${q.leadTimeDays} days` : "—"}</td>
                <td>{q.expiresAt ? q.expiresAt.toLocaleDateString() : "—"}</td>
                <td>{q.isExpired ? "Expired" : "Valid"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {best && (
        <p style={{ marginTop: "1.5rem" }}>
          <Link
            href={`/procurement/purchase-orders/new?jobId=${jobId}&vendorId=${best.vendorId}&quoteId=${best.id}`}
          >
            Create Purchase Order from best quote ({best.vendorName}, ${best.price.toFixed(2)})
          </Link>
        </p>
      )}
    </div>
  );
}
