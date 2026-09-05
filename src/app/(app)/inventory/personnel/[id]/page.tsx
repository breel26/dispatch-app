import Link from "next/link";
import { notFound } from "next/navigation";
import { getPersonnelById } from "@/modules/inventory/repository";
import { listAssignmentsForResource } from "@/modules/dispatch/repository";
import { listJobs } from "@/modules/jobs/repository";
import { describeCraft } from "@/modules/inventory/craft";
import { decryptPii, maskKeepingLast } from "@/modules/shared/pii";
import DeactivateButton from "./DeactivateButton";
import styles from "../../detail.module.css";
import { requireAuthContext } from "@/modules/shared/currentUser";

export const dynamic = "force-dynamic";

interface PersonnelDetailPageProps {
  params: Promise<{ id: string }>;
}

// Decrypts only long enough to compute a masked string, entirely on the
// server, and returns that string - never the encrypted bytes or the full
// plaintext. This function's return value is the only thing that reaches
// JSX, so the full SSN/license number never exists in anything sent to
// the browser, not even transiently.
function maskedOrNotOnFile(encrypted: Uint8Array | null): string {
  if (!encrypted) return "Not on file";
  return `On file, ending in ${maskKeepingLast(decryptPii(encrypted)).slice(-4)}`;
}

// dateOfBirth/hireDate are @db.Date columns - Prisma represents them as a
// Date at midnight UTC. Formatting with the default (local-timezone)
// toLocaleDateString() converts that instant to the server's local zone
// first, which rolls the displayed date back by one for anyone west of
// UTC - "1900-01-01" was rendering as "12/31/1899" on this server.
// Forcing the formatter to read the date in UTC is what the edit page's
// toDateInputValue avoids the same way, using UTC getters directly.
function formatDateOnly(date: Date): string {
  return date.toLocaleDateString(undefined, { timeZone: "UTC" });
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

  const fullName = [personnel.firstName, personnel.middleName, personnel.lastName]
    .filter(Boolean)
    .join(" ");

  return (
    <div>
      <div className={styles.headerRow}>
        <div>
          <h1>{fullName}</h1>
          <p className={styles.meta}>
            #{personnel.employeeId} ·{" "}
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
        <h2>HR details</h2>
        <p className={styles.meta}>Date of birth: {formatDateOnly(personnel.dateOfBirth)}</p>
        <p className={styles.meta}>Hire date: {formatDateOnly(personnel.hireDate)}</p>
        <p className={styles.meta}>Phone: {personnel.phoneNumber}</p>
        <p className={styles.meta}>
          {personnel.homeStreet1}
          {personnel.homeStreet2 ? `, ${personnel.homeStreet2}` : ""}, {personnel.homeCity},{" "}
          {personnel.homeState} {personnel.homePostalCode}
        </p>
        {/* Full values are never rendered - only whether one is on file
            and, for SSN, its last four digits, computed server-side by
            maskedOrNotOnFile above. */}
        <p className={styles.meta}>SSN: {maskedOrNotOnFile(personnel.ssnEncrypted)}</p>
        <p className={styles.meta}>
          Driver license: {maskedOrNotOnFile(personnel.driversLicenseNumberEncrypted)}
        </p>
      </div>

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
