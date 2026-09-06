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
import { requireAuthContext } from "@/modules/shared/currentUser";
import { describeCraft } from "@/modules/inventory/craft";

export const dynamic = "force-dynamic";

interface JobDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function JobDetailPage({ params }: JobDetailPageProps) {
  const { orgId } = await requireAuthContext();
  const { id } = await params;
  const job = await getJobById(orgId, id);
  if (!job) notFound();

  const [assignments, personnel, materials, equipment, quoteRequests, purchaseOrders] =
    await Promise.all([
      listAssignmentsForJob(orgId, id),
      listPersonnel(orgId, false),
      listMaterials(orgId),
      listEquipment(orgId),
      listQuoteRequestsForJob(orgId, id),
      listPurchaseOrdersForJob(orgId, id),
    ]);

  const personnelById = new Map(personnel.map((p) => [p.id, p]));
  const materialsById = new Map(materials.map((m) => [m.id, m]));
  const equipmentById = new Map(equipment.map((e) => [e.id, e]));

  function resourceLabel(a: (typeof assignments)[number]): string {
    if (a.resourceType === "PERSONNEL" && a.personnelId) {
      const person = personnelById.get(a.personnelId);
      return person ? `${person.firstName} ${person.lastName}` : a.personnelId;
    }
    if (a.resourceType === "MATERIAL" && a.materialId) {
      return materialsById.get(a.materialId)?.name ?? a.materialId;
    }
    if (a.resourceType === "EQUIPMENT" && a.equipmentId) {
      const item = equipmentById.get(a.equipmentId);
      return item ? `${item.equipmentNumber} — ${item.name} — ${item.type}` : a.equipmentId;
    }
    return "—";
  }

  // Labor first, then Equipment, then Materials - a fixed order rather
  // than one flat table sorted however assignments were created.
  const laborAssignments = assignments.filter((a) => a.resourceType === "PERSONNEL");
  const equipmentAssignments = assignments.filter((a) => a.resourceType === "EQUIPMENT");
  const materialAssignments = assignments.filter((a) => a.resourceType === "MATERIAL");

  function assignmentTable(rows: typeof assignments) {
    return (
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Resource</th>
            <th>Quantity</th>
            <th>Start</th>
            <th>End</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id}>
              <td>{resourceLabel(a)}</td>
              <td>{a.quantity ?? "—"}</td>
              <td>{a.startAt.toLocaleString()}</td>
              <td>{a.endAt ? a.endAt.toLocaleString() : "—"}</td>
              <td>
                <CancelAssignmentButton jobId={id} assignmentId={a.id} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
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
            // Crew are picked by trade, so the option says which trade:
            // "dave eguiza - Carpenter, Journeyman".
            .map((p) => ({
              id: p.id,
              label: `${p.firstName} ${p.lastName} - ${describeCraft(p.craft, p.classification)}`,
            }))}
          materialOptions={materials.map((m) => ({ id: m.id, label: `${m.name} (${m.sku})` }))}
          // Equipment is found by owner+type (browse) or by fleet number
          // (search) - `owner`, `type`, and `number` are carried alongside
          // the id so AssignmentForm can narrow by any of them.
          equipmentOptions={equipment.map((e) => ({
            id: e.id,
            number: e.equipmentNumber,
            owner: e.name,
            type: e.type,
          }))}
        />
        {assignments.length === 0 && <p className={styles.empty}>No assignments yet.</p>}

        {laborAssignments.length > 0 && (
          <div className={styles.subsection}>
            <h3>Labor</h3>
            {assignmentTable(laborAssignments)}
          </div>
        )}

        {equipmentAssignments.length > 0 && (
          <div className={styles.subsection}>
            <h3>Equipment</h3>
            {assignmentTable(equipmentAssignments)}
          </div>
        )}

        {materialAssignments.length > 0 && (
          <div className={styles.subsection}>
            <h3>Materials</h3>
            {assignmentTable(materialAssignments)}
          </div>
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
