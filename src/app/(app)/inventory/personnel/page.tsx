import Link from "next/link";
import { listPersonnel } from "@/modules/inventory/repository";
import { craftLabel, classificationLabel } from "@/modules/inventory/craft";
import styles from "../list.module.css";
import { requireAuthContext } from "@/modules/shared/currentUser";

export const dynamic = "force-dynamic";

interface PersonnelPageProps {
  searchParams: Promise<{ all?: string }>;
}

export default async function PersonnelPage({ searchParams }: PersonnelPageProps) {
  const { orgId } = await requireAuthContext();
  const { all } = await searchParams;
  const showAll = all === "true";
  const personnel = await listPersonnel(orgId, !showAll);

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
              <th>Employee ID</th>
              <th>Name</th>
              <th>Craft</th>
              <th>Classification</th>
              <th>Certifications</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {personnel.map((p) => (
              <tr key={p.id}>
                <td>{p.employeeId}</td>
                <td>
                  <Link href={`/inventory/personnel/${p.id}`}>{p.name}</Link>
                </td>
                <td>{craftLabel(p.craft)}</td>
                <td>{classificationLabel(p.classification)}</td>
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
