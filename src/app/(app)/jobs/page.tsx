import Link from "next/link";
import { listJobs } from "@/modules/jobs/repository";
import { JOB_STATUSES, type JobStatus } from "@/modules/jobs/types";
import styles from "./page.module.css";
import { requireAuthContext } from "@/modules/shared/currentUser";

export const dynamic = "force-dynamic";

interface JobsPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const { orgId } = await requireAuthContext();
  const { status } = await searchParams;
  const activeStatus = status && JOB_STATUSES.includes(status as JobStatus) ? (status as JobStatus) : undefined;
  const jobs = await listJobs(orgId, { status: activeStatus, limit: 100 });

  return (
    <div>
      <div className={styles.headerRow}>
        <h1>Jobs</h1>
        <Link href="/jobs/new" className={styles.newButton}>
          New Job
        </Link>
      </div>

      <div className={styles.filters}>
        <Link href="/jobs" className={!activeStatus ? styles.active : undefined}>
          All
        </Link>
        {JOB_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/jobs?status=${s}`}
            className={activeStatus === s ? styles.active : undefined}
          >
            {s}
          </Link>
        ))}
      </div>

      {jobs.length === 0 ? (
        <p className={styles.empty}>No jobs found.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Job #</th>
              <th>Name</th>
              <th>Site address</th>
              <th>Status</th>
              <th>Start</th>
              <th>End</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>{job.jobNumber}</td>
                <td>
                  <Link href={`/jobs/${job.id}`}>{job.name}</Link>
                </td>
                <td>{job.siteAddress}</td>
                <td>
                  <span className={styles.badge}>{job.status}</span>
                </td>
                <td>{job.startDate ? job.startDate.toLocaleDateString() : "—"}</td>
                <td>{job.endDate ? job.endDate.toLocaleDateString() : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
