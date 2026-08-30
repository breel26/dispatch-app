import Link from "next/link";
import { notFound } from "next/navigation";
import { getVendorById } from "@/modules/vendors/repository";
import DeleteVendorForm from "./DeleteVendorForm";
import styles from "./detail.module.css";

export const dynamic = "force-dynamic";

interface VendorDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function VendorDetailPage({ params }: VendorDetailPageProps) {
  const { id } = await params;
  const vendor = await getVendorById(id);
  if (!vendor) notFound();

  return (
    <div>
      <div className={styles.headerRow}>
        <div>
          <h1>{vendor.name}</h1>
          <p className={styles.meta}>{vendor.email}</p>
        </div>
        <Link href={`/vendors/${vendor.id}/edit`} className={styles.editLink}>
          Edit
        </Link>
      </div>

      {vendor.phone && <p className={styles.meta}>Phone: {vendor.phone}</p>}
      {vendor.categories.length > 0 && (
        <p className={styles.meta}>Categories: {vendor.categories.join(", ")}</p>
      )}

      <div className={styles.section}>
        <DeleteVendorForm vendorId={vendor.id} />
      </div>
    </div>
  );
}
