import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import styles from "./layout.module.css";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>
          Dispatch
        </Link>
        <nav className={styles.nav}>
          <Link href="/jobs">Jobs</Link>
          <Link href="/inventory">Inventory</Link>
          <Link href="/vendors">Vendors</Link>
          {/* The two procurement stages get their own tabs: the PO list was
              previously reachable only by URL or from a job detail page. */}
          <Link href="/procurement/quote-requests">Procurement</Link>
          <Link href="/procurement/purchase-orders">Purchase Orders</Link>
        </nav>
        <div className={styles.headerRight}>
          <UserButton />
        </div>
      </header>
      <main className={styles.main}>{children}</main>
    </>
  );
}
