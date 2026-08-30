import Link from "next/link";
import { notFound } from "next/navigation";
import { getJobById } from "@/modules/jobs/repository";
import { getAllowedNextStatuses } from "@/modules/jobs/statusTransitions";
import { listAssignmentsForJob } from "@/modules/dispatch/repository";
import { listPersonnel, listMaterials, listEquipment } from "@/modules/inventory/repository";
import { listQuoteRequestsForJob, listPurchaseOrdersForJob } from "@/modules/procurement/repository";
import type { JobStatus } from "@/modules/jobs/types";
import JobStatusForm from "./JobStatusForm";
import AssignmentForm from "./AssignmentForm";
import CancelAssignmentButton from "./CancelAssignmentButton";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

interface JobDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { id } = await params;
  const job = await getJobById(id);
  if (!job) notFound();

  const [assignments, personnel, materials, equipment, quoteRequests, purchaseOrders] =
    await Promise.all([
      listAssignmentsForJob(id),
      listPersonnel(false),
      listMaterials(),
      listEquipment(),
      listQuoteRequestsForJob(id),
      listPurchaseOrdersForJob(id),
    ]);

  const personnelById = new Map(personnel.map((p) => [p.id, p]));
  const materialsById = new Map(materials.map((m) => [m.id, m]));
  const equipmentById = new Map(equipment.map((e) => [e.id, e]));

  function resourceLabel(a: (typeof assignments)[number]): string {
    if (a.resourceType === "PERSONNEL" && a.personnelId) {
      return personnelById.get(a.personnelId)?.name ?? a.personnelId;
    }
    if (a.resourceType === "MATERIAL" && a.materialId) {
      return materialsById.get(a.materialId)?.name ?? a.materialId;
    }
    if (a.resourceType === "EQUIPMENT" && a.equipmentId) {
      return equipmentById.get(a.equipmentId)?.name ?? a.equipmentId;
    }
    return "—";
  }

  return (
    <div>
      <div className={styles.headerRow}>
        <div>
          <h1>{job.name}</h1>
          <p className={styles.meta}>
            Job #{job.jobNumber} &middot; {job.siteAddress}
          </p>
        </div>
        <Link href={`/jobs/${job.id}/edit`} className={styles.editLink}>
          Edit
        </Link>
      </div>

      <p>
        Status: <span className={styles.badge}>{job.status}</span>
      </p>
      <p className={styles.meta}>
        {job.startDate ? job.startDate.toLocaleDateString() : "No start date"} –{" "}
        {job.endDate ? job.endDate.toLocaleDateString() : "No end date"}
      </p>
      {job.notes && <p>{job.notes}</p>}

      <JobStatusForm jobId={job.id} allowedNextStatuses={getAllowedNextStatuses(job.status as JobStatus)} />

      <div className={styles.section}>
        <h2>Assignments</h2>
        <AssignmentForm
          jobId={job.id}
          personnelOptions={personnel
            .filter((p) => p.isActive)
            .map((p) => ({ id: p.id, label: p.name }))}
          materialOptions={materials.map((m) => ({ id: m.id, label: `${m.name} (${m.sku})` }))}
          equipmentOptions={equipment.map((e) => ({ id: e.id, label: e.name }))}
        />
        {assignments.length === 0 ? (
          <p className={styles.empty}>No assignments yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Resource</th>
                <th>Quantity</th>
                <th>Start</th>
                <th>End</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a.id}>
                  <td>{a.resourceType}</td>
                  <td>{resourceLabel(a)}</td>
                  <td>{a.quantity ?? "—"}</td>
                  <td>{a.startAt.toLocaleString()}</td>
                  <td>{a.endAt ? a.endAt.toLocaleString() : "—"}</td>
                  <td>
                    <CancelAssignmentButton jobId={job.id} assignmentId={a.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={styles.section}>
        <h2>
          Quote Requests
          <Link href={`/procurement/quote-requests/new?jobId=${job.id}`} className={styles.sectionLink}>
            New Quote Request
          </Link>
        </h2>
        {quoteRequests.length === 0 ? (
          <p className={styles.empty}>No quote requests yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Status</th>
                <th>Items</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {quoteRequests.map((qr) => (
                <tr key={qr.id}>
                  <td>{qr.vendor.name}</td>
                  <td>
                    <span className={styles.badge}>{qr.status}</span>
                  </td>
                  <td>{qr.items.length}</td>
                  <td>
                    <Link href={`/procurement/quote-requests/${qr.id}`}>View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className={styles.sectionLink}>
          <Link href={`/procurement/jobs/${job.id}/compare`}>Compare quotes for this job</Link>
        </p>
      </div>

      <div className={styles.section}>
        <h2>
          Purchase Orders
          <Link
            href={`/procurement/purchase-orders/new?jobId=${job.id}`}
            className={styles.sectionLink}
          >
            New Purchase Order
          </Link>
        </h2>
        {purchaseOrders.length === 0 ? (
          <p className={styles.empty}>No purchase orders yet.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>PO Number</th>
                <th>Vendor</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.map((po) => (
                <tr key={po.id}>
                  <td>{po.poNumber}</td>
                  <td>{po.vendor.name}</td>
                  <td>
                    <span className={styles.badge}>{po.status}</span>
                  </td>
                  <td>
                    <Link href={`/procurement/purchase-orders/${po.id}`}>View</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
