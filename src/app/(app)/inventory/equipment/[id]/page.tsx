import Link from "next/link";
import { notFound } from "next/navigation";
import { getEquipmentById } from "@/modules/inventory/repository";
import { listAssignmentsForResource } from "@/modules/dispatch/repository";
import { listJobs } from "@/modules/jobs/repository";
import styles from "../../detail.module.css";
import { requireAuthContext } from "@/modules/shared/currentUser";

export const dynamic = "force-dynamic";

interface EquipmentDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function EquipmentDetailPage({ params }: EquipmentDetailPageProps) {
  const { orgId } = await requireAuthContext();
  const { id } = await params;
  const equipment = await getEquipmentById(orgId, id);
  if (!equipment) notFound();

  const [assignments, jobs] = await Promise.all([
    listAssignmentsForResource(orgId, "EQUIPMENT", id),
    listJobs(orgId, { limit: 200 }),
  ]);
  const jobsById = new Map(jobs.map((j) => [j.id, j]));

  return (
    <div>
      <div className={styles.headerRow}>
        <div>
          <h1>{equipment.name}</h1>
          <p className={styles.meta}>
            #{equipment.equipmentNumber} · {equipment.type}
          </p>
        </div>
        <Link href={`/inventory/equipment/${equipment.id}/edit`} className={styles.editLink}>
          Edit
        </Link>
      </div>

      <p>
        Status: <span className={styles.badge}>{equipment.status}</span>
      </p>
      <p className={styles.meta}>
        {equipment.make} {equipment.model}
      </p>
      <p className={styles.meta}>
        Operating hours:{" "}
        {equipment.operatingHours != null ? equipment.operatingHours : "Not recorded"}
      </p>
      {equipment.requiredCertifications.length > 0 && (
        <p className={styles.meta}>
          Required certifications: {equipment.requiredCertifications.join(", ")}
        </p>
      )}
      {equipment.location && <p className={styles.meta}>Location: {equipment.location}</p>}

      <div className={styles.section}>
        <h2>Assignments</h2>
        {assignments.length === 0 ? (
          <p className={styles.empty}>No assignments.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Job</th>
                <th>Quantity</th>
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
                  <td>{a.quantity ?? "—"}</td>
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
