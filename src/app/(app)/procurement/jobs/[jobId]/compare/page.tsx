import Link from "next/link";
import { notFound } from "next/navigation";
import { getJobById } from "@/modules/jobs/repository";
import { compareQuotesForJob } from "@/modules/procurement/repository";
import { formatMoney } from "@/modules/shared/money";
import { requireAuthContext } from "@/modules/shared/currentUser";
import styles from "../../../list.module.css";

export const dynamic = "force-dynamic";

interface ComparePageProps {
  params: Promise<{ jobId: string }>;
}

// One table per requested item, rather than a single ranking across the
// whole job. Ranking a concrete quote against a crane rental produced a
// "winner" that meant nothing; the question a dispatcher actually has is
// "for these 200 bags of cement, who is cheapest?".
export default async function CompareQuotesPage({ params }: ComparePageProps) {
  const { orgId } = await requireAuthContext();
  const { jobId } = await params;
  const job = await getJobById(orgId, jobId);
  if (!job) notFound();

  const { items, bestCaseTotal, itemsWithoutUsableQuote } = await compareQuotesForJob(orgId, jobId);

  return (
    <div>
      <h1>Compare Quotes — {job.name}</h1>

      {items.length === 0 ? (
        <p className={styles.empty}>No quotes recorded for this job yet.</p>
      ) : (
        <>
          {items.map((item) => (
            <section key={item.itemKey} style={{ marginBottom: "2rem" }}>
              <h2 style={{ fontSize: "1.05rem", marginBottom: "0.5rem" }}>
                {item.itemLabel}{" "}
                <span className={styles.badge}>qty {item.quantity}</span>
              </h2>

              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Vendor</th>
                    <th>Unit price</th>
                    <th>Extended</th>
                    <th>Lead time</th>
                    <th>Expires</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {item.lines.map((line) => (
                    <tr key={`${line.quoteId}:${line.itemKey}`}>
                      <td>{line.rank}</td>
                      <td>{line.vendorName}</td>
                      <td>{formatMoney(line.unitPriceAmount)}</td>
                      <td>{formatMoney(line.extendedTotal)}</td>
                      <td>{line.leadTimeDays != null ? `${line.leadTimeDays} days` : "—"}</td>
                      <td>{line.expiresAt ? line.expiresAt.toLocaleDateString() : "—"}</td>
                      <td>{line.isExpired ? "Expired" : "Valid"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {item.best ? (
                <p style={{ marginTop: "0.5rem" }}>
                  <Link
                    href={`/procurement/purchase-orders/new?jobId=${jobId}&vendorId=${item.best.vendorId}&quoteId=${item.best.quoteId}`}
                  >
                    Create Purchase Order from {item.best.vendorName} (
                    {formatMoney(item.best.extendedTotal)})
                  </Link>
                </p>
              ) : (
                <p className={styles.empty} style={{ marginTop: "0.5rem" }}>
                  Every quote for this item has expired — request fresh pricing.
                </p>
              )}
            </section>
          ))}

          <div style={{ marginTop: "1.5rem" }}>
            {bestCaseTotal ? (
              <p style={{ fontWeight: 600 }}>
                Best case total, buying each item from its cheapest vendor:{" "}
                {formatMoney(bestCaseTotal)}
              </p>
            ) : (
              // Deliberately no number here. A "best total" that quietly
              // omits an unpriced item is worse than no total at all.
              <p className={styles.empty}>
                No overall total yet — still missing usable quotes for:{" "}
                {itemsWithoutUsableQuote.join(", ")}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
