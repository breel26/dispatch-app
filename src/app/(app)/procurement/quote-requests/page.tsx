import Link from "next/link";
import { listQuoteRequests, listQuoteRequestsForJob } from "@/modules/procurement/repository";
import styles from "../list.module.css";

export const dynamic = "force-dynamic";

interface QuoteRequestsPageProps {
  searchParams: Promise<{ jobId?: string }>;
}

export default async function QuoteRequestsPage({ searchParams }: QuoteRequestsPageProps) {
  const { jobId } = await searchParams;
  const quoteRequests = jobId ? await listQuoteRequestsForJob(jobId) : await listQuoteRequests();

  return (
    <div>
      <div className={styles.headerRow}>
        <h1>Quote Requests</h1>
        <Link
          href={jobId ? `/procurement/quote-requests/new?jobId=${jobId}` : "/procurement/quote-requests/new"}
          className={styles.newButton}
        >
          New Quote Request
        </Link>
      </div>

      {quoteRequests.length === 0 ? (
        <p className={styles.empty}>No quote requests found.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Vendor</th>
              <th>Status</th>
              <th>Items</th>
              <th>Sent</th>
            </tr>
          </thead>
          <tbody>
            {quoteRequests.map((qr) => (
              <tr key={qr.id}>
                <td>
                  <Link href={`/procurement/quote-requests/${qr.id}`}>{qr.vendor.name}</Link>
                </td>
                <td>
                  <span className={styles.badge}>{qr.status}</span>
                </td>
                <td>{qr.items.length}</td>
                <td>{qr.sentAt ? qr.sentAt.toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
