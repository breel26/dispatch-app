// Seeds the one row PurchaseOrderSequence relies on. Migrations only
// create the table — this row (id: 1, lastPoNumber: 0) must exist before
// nextPoNumber()/createPurchaseOrder() can run their `update` against it,
// since Prisma's update throws P2025 if the row is missing. Idempotent:
// safe to re-run against a database that's already seeded.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  await prisma.purchaseOrderSequence.upsert({
    where: { id: 1 },
    create: { id: 1, lastPoNumber: 0 },
    update: {},
  });
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
