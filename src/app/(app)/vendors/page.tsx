import Link from "next/link";
import { listVendors, findVendorsByCategory } from "@/modules/vendors/repository";
import styles from "./list.module.css";

export const dynamic = "force-dynamic";

interface VendorsPageProps {
  searchParams: Promise<{ category?: string }>;
}

export default async function VendorsPage({ searchParams }: VendorsPageProps) {
  const { category } = await searchParams;
  const vendors = category ? await findVendorsByCategory(category) : await listVendors();

  return (
    <div>
      <div className={styles.headerRow}>
        <h1>Vendors</h1>
        <Link href="/vendors/new" className={styles.newButton}>
          New Vendor
        </Link>
      </div>

      {vendors.length === 0 ? (
        <p className={styles.empty}>No vendors found.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Categories</th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <tr key={v.id}>
                <td>
                  <Link href={`/vendors/${v.id}`}>{v.name}</Link>
                </td>
                <td>{v.email}</td>
                <td>{v.phone ?? "—"}</td>
                <td>{v.categories.join(", ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
