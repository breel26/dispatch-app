import Link from "next/link";
import { listEquipment } from "@/modules/inventory/repository";
import type { Equipment } from "@prisma/client";
import styles from "../list.module.css";

export const dynamic = "force-dynamic";

const EQUIPMENT_STATUSES: Equipment["status"][] = [
  "AVAILABLE",
  "ASSIGNED",
  "MAINTENANCE",
  "OUT_OF_SERVICE",
];

interface EquipmentPageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function EquipmentPage({ searchParams }: EquipmentPageProps) {
  const { status } = await searchParams;
  const activeStatus = EQUIPMENT_STATUSES.includes(status as Equipment["status"])
    ? (status as Equipment["status"])
    : undefined;
  const equipment = await listEquipment(activeStatus);

  return (
    <div>
      <div className={styles.headerRow}>
        <h1>Equipment</h1>
        <Link href="/inventory/equipment/new" className={styles.newButton}>
          New Equipment
        </Link>
      </div>

      <div className={styles.filters}>
        <Link href="/inventory/equipment" className={!activeStatus ? styles.active : undefined}>
          All
        </Link>
        {EQUIPMENT_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/inventory/equipment?status=${s}`}
            className={activeStatus === s ? styles.active : undefined}
          >
            {s}
          </Link>
        ))}
      </div>

      {equipment.length === 0 ? (
        <p className={styles.empty}>No equipment found.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Status</th>
              <th>Location</th>
            </tr>
          </thead>
          <tbody>
            {equipment.map((e) => (
              <tr key={e.id}>
                <td>
                  <Link href={`/inventory/equipment/${e.id}`}>{e.name}</Link>
                </td>
                <td>{e.type}</td>
                <td>
                  <span className={styles.badge}>{e.status}</span>
                </td>
                <td>{e.location ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
