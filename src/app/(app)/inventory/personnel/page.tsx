import Link from "next/link";
import { listPersonnel } from "@/modules/inventory/repository";
import styles from "../list.module.css";

export const dynamic = "force-dynamic";

interface PersonnelPageProps {
  searchParams: Promise<{ all?: string }>;
}

export default async function PersonnelPage({ searchParams }: PersonnelPageProps) {
  const { all } = await searchParams;
  const showAll = all === "true";
  const personnel = await listPersonnel(!showAll);

  return (
    <div>
      <div className={styles.headerRow}>
        <h1>Personnel</h1>
        <Link href="/inventory/personnel/new" className={styles.newButton}>
          New Personnel
        </Link>
      </div>

      <div className={styles.filters}>
        <Link href="/inventory/personnel" className={!showAll ? styles.active : undefined}>
          Active only
        </Link>
        <Link href="/inventory/personnel?all=true" className={showAll ? styles.active : undefined}>
          All
        </Link>
      </div>

      {personnel.length === 0 ? (
        <p className={styles.empty}>No personnel found.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role</th>
              <th>Certifications</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {personnel.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/inventory/personnel/${p.id}`}>{p.name}</Link>
                </td>
                <td>{p.role}</td>
                <td>{p.certifications.join(", ") || "—"}</td>
                <td>
                  <span className={styles.badge}>{p.isActive ? "Active" : "Inactive"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
