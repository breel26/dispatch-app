import Link from "next/link";
import { listJobs } from "@/modules/jobs/repository";
import { listMaterials } from "@/modules/inventory/repository";
import { findLowStockMaterials } from "@/modules/inventory/stockLevels";
import { listQuoteRequests } from "@/modules/procurement/repository";
import styles from "./page.module.css";
import { requireAuthContext } from "@/modules/shared/currentUser";

// This reads live DB data on every request — must not be statically
// prerendered at build time, or these counts would freeze as of the last
// build instead of reflecting the current state.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { orgId } = await requireAuthContext();
  const [activeJobs, materials, quoteRequests] = await Promise.all([
    listJobs(orgId, { status: "ACTIVE" }),
    listMaterials(orgId),
    listQuoteRequests(orgId),
  ]);

  const lowStockCount = findLowStockMaterials(materials).length;
  const openQuoteRequestCount = quoteRequests.filter(
    (qr) => qr.status === "DRAFT" || qr.status === "SENT"
  ).length;

  return (
    <div>
      <div className={styles.stats}>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{activeJobs.length}</span>
          <span className={styles.statLabel}>Active jobs</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{lowStockCount}</span>
          <span className={styles.statLabel}>Low-stock materials</span>
        </div>
        <div className={styles.statCard}>
          <span className={styles.statValue}>{openQuoteRequestCount}</span>
          <span className={styles.statLabel}>Open quote requests</span>
        </div>
      </div>
      <div className={styles.links}>
        <Link href="/jobs">Jobs</Link>
        <Link href="/inventory">Inventory</Link>
        <Link href="/vendors">Vendors</Link>
        <Link href="/procurement/quote-requests">Procurement</Link>
      </div>
    </div>
  );
}
