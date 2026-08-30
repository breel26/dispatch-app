import Link from "next/link";
import { notFound } from "next/navigation";
import { getQuoteRequestById } from "@/modules/procurement/repository";
import { listMaterials, listEquipment } from "@/modules/inventory/repository";
import MarkSentButton from "./MarkSentButton";
import RecordQuoteForm from "./RecordQuoteForm";
import styles from "../../detail.module.css";

export const dynamic = "force-dynamic";

interface QuoteRequestDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function QuoteRequestDetailPage({ params }: QuoteRequestDetailPageProps) {
  const { id } = await params;
  const quoteRequest = await getQuoteRequestById(id);
  if (!quoteRequest) notFound();

  const [materials, equipment] = await Promise.all([listMaterials(), listEquipment()]);
  const materialsById = new Map(materials.map((m) => [m.id, m]));
  const equipmentById = new Map(equipment.map((e) => [e.id, e]));

  function itemLabel(item: NonNullable<typeof quoteRequest>["items"][number]): string {
    if (item.materialId) return materialsById.get(item.materialId)?.name ?? item.materialId;
    if (item.equipmentId) return equipmentById.get(item.equipmentId)?.name ?? item.equipmentId;
    return "—";
  }

  const itemOptions = quoteRequest.items.map((item) => ({
    id: item.id,
    type: item.materialId ? ("MATERIAL" as const) : ("EQUIPMENT" as const),
    resourceId: (item.materialId ?? item.equipmentId)!,
    label: `${itemLabel(item)} (qty ${item.quantity})`,
  }));

  return (
    <div>
      <div className={styles.headerRow}>
        <div>
          <h1>Quote Request — {quoteRequest.vendor.name}</h1>
          <p className={styles.meta}>Status: {quoteRequest.status}</p>
        </div>
      </div>

      {quoteRequest.status === "DRAFT" && <MarkSentButton quoteRequestId={quoteRequest.id} />}

      <div className={styles.section}>
        <h2>Items</h2>
        <ul>
          {quoteRequest.items.map((item) => (
            <li key={item.id}>
              {itemLabel(item)} — quantity {item.quantity}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.section}>
        <h2>Quote</h2>
        {quoteRequest.quote ? (
          <div>
            <p>Price: ${quoteRequest.quote.price.toFixed(2)}</p>
            {quoteRequest.quote.leadTimeDays != null && (
              <p>Lead time: {quoteRequest.quote.leadTimeDays} days</p>
            )}
            {quoteRequest.quote.expiresAt && (
              <p>Expires: {quoteRequest.quote.expiresAt.toLocaleDateString()}</p>
            )}
          </div>
        ) : (
          <RecordQuoteForm
            quoteRequestId={quoteRequest.id}
            vendorId={quoteRequest.vendorId}
            items={itemOptions}
          />
        )}
      </div>

      <p className={styles.meta}>
        <Link href={`/jobs/${quoteRequest.jobId}`}>Back to job</Link>
      </p>
    </div>
  );
}
