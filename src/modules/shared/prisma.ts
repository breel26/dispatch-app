import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Standard Next.js pattern: in dev, hot-reload would otherwise create a
// new PrismaClient (and new DB connection pool) on every file change.
// Caching it on the global object avoids that.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Prisma 7 removed implicit connection-string handling — PrismaClient now
// requires an explicit driver adapter, even when the URL is already
// configured in prisma.config.ts (that config only covers the CLI).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
