import Link from "next/link";

export default function InventoryHubPage() {
  return (
    <div>
      <h1>Inventory</h1>
      <ul>
        <li>
          <Link href="/inventory/personnel">Personnel</Link>
        </li>
        <li>
          <Link href="/inventory/materials">Materials</Link>
        </li>
        <li>
          <Link href="/inventory/equipment">Equipment</Link>
        </li>
      </ul>
    </div>
  );
}
