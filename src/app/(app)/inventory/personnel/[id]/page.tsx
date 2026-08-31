import Link from "next/link";
import { notFound } from "next/navigation";
import { getPersonnelById } from "@/modules/inventory/repository";
import { listAssignmentsForResource } from "@/modules/dispatch/repository";
import { listJobs } from "@/modules/jobs/repository";
import { describeCraft } from "@/modules/inventory/craft";
import DeactivateButton from "./DeactivateButton";
import styles from "../../detail.module.css";
import { requireAuthContext } from "@/modules/shared/currentUser";

export const dynamic = "force-dynamic";

interface PersonnelDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function PersonnelDetailPage({ params }: PersonnelDetailPageProps) {
  const { orgId } = await requireAuthContext();
  const { id } = await params;
  const personnel = await getPersonnelById(orgId, id);
  if (!personnel) notFound();

  const [assignments, jobs] = await Promise.all([
    listAssignmentsForResource(orgId, "PERSONNEL", id),
    listJobs(orgId, { limit: 200 }),
  ]);
  const jobsById = new Map(jobs.map((j) => [j.id, j]));

  return (
    <div>
      <div className={styles.headerRow}>
        <div>
          <h1>{personnel.name}</h1>
          <p className={styles.meta}>
            {describeCraft(personnel.craft, personnel.classification)}
          </p>
        </div>
        <Link href={`/inventory/personnel/${personnel.id}/edit`} className={styles.editLink}>
          Edit
        </Link>
      </div>

      <p>
        Status:{" "}
        <span className={styles.badge}>{personnel.isActive ? "Active" : "Inactive"}</span>
      </p>
      {personnel.certifications.length > 0 && (
        <p className={styles.meta}>Certifications: {personnel.certifications.join(", ")}</p>
      )}

      {personnel.isActive && (
        <div className={styles.section}>
          <DeactivateButton personnelId={personnel.id} />
        </div>
      )}

      <div className={styles.section}>
        <h2>Assignments</h2>
        {assignments.length === 0 ? (
          <p className={styles.empty}>No assignments.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Job</th>
                <th>Start</th>
                <th>End</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/jobs/${a.jobId}`}>{jobsById.get(a.jobId)?.name ?? a.jobId}</Link>
                  </td>
                  <td>{a.startAt.toLocaleString()}</td>
                  <td>{a.endAt ? a.endAt.toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
