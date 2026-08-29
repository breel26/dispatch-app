import { PrismaClient } from "@prisma/client";

// Standard Next.js pattern: in dev, hot-reload would otherwise create a
// new PrismaClient (and new DB connection pool) on every file change.
// Caching it on the global object avoids that.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
