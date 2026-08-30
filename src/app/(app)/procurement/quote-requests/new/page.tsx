import { listJobs } from "@/modules/jobs/repository";
import { listVendors } from "@/modules/vendors/repository";
import { listMaterials, listEquipment } from "@/modules/inventory/repository";
import QuoteRequestForm from "../QuoteRequestForm";
import { requireAuthContext } from "@/modules/shared/currentUser";

export const dynamic = "force-dynamic";

interface NewQuoteRequestPageProps {
  searchParams: Promise<{ jobId?: string }>;
}

export default async function NewQuoteRequestPage({ searchParams }: NewQuoteRequestPageProps) {
  const { orgId } = await requireAuthContext();
  const { jobId } = await searchParams;
  const [jobs, vendors, materials, equipment] = await Promise.all([
    listJobs(orgId, { limit: 200 }),
    listVendors(orgId),
    listMaterials(orgId),
    listEquipment(orgId),
  ]);

  return (
    <div>
      <h1>New Quote Request</h1>
      <QuoteRequestForm
        jobs={jobs.map((j) => ({ id: j.id, label: j.name }))}
        vendors={vendors.map((v) => ({ id: v.id, label: v.name }))}
        materials={materials.map((m) => ({ id: m.id, label: `${m.name} (${m.sku})` }))}
        equipment={equipment.map((e) => ({ id: e.id, label: e.name }))}
        defaultJobId={jobId}
      />
    </div>
  );
}
