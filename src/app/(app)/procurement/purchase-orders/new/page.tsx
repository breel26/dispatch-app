import { listJobs } from "@/modules/jobs/repository";
import { listVendors } from "@/modules/vendors/repository";
import { listMaterials, listEquipment } from "@/modules/inventory/repository";
import PurchaseOrderForm from "../PurchaseOrderForm";

export const dynamic = "force-dynamic";

interface NewPurchaseOrderPageProps {
  searchParams: Promise<{ jobId?: string; vendorId?: string; quoteId?: string }>;
}

export default async function NewPurchaseOrderPage({ searchParams }: NewPurchaseOrderPageProps) {
  const { jobId, vendorId, quoteId } = await searchParams;
  const [jobs, vendors, materials, equipment] = await Promise.all([
    listJobs({ limit: 200 }),
    listVendors(),
    listMaterials(),
    listEquipment(),
  ]);

  return (
    <div>
      <h1>New Purchase Order</h1>
      <PurchaseOrderForm
        jobs={jobs.map((j) => ({ id: j.id, label: j.name }))}
        vendors={vendors.map((v) => ({ id: v.id, label: v.name }))}
        materials={materials.map((m) => ({ id: m.id, label: `${m.name} (${m.sku})` }))}
        equipment={equipment.map((e) => ({ id: e.id, label: e.name }))}
        defaultJobId={jobId}
        defaultVendorId={vendorId}
        defaultQuoteId={quoteId}
      />
    </div>
  );
}
