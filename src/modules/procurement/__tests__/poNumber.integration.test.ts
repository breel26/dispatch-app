// INTEGRATION TEST - requires a real Postgres database and a generated
// Prisma Client. Run with `npm run test:integration` against a real
// DATABASE_URL, ideally in CI on every PR that touches
// procurement/repository.ts.
//
// What this proves that the unit tests do not: PO numbers come from a
// Postgres sequence now, not a counter row, and nextval() is atomic under
// real concurrency. The unit tests only cover the formatting function.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { nextPoNumber } from "../repository";
import { parsePoNumber } from "../poNumber";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

describe("PO number generation under concurrency (integration)", () => {
  beforeAll(async () => {
    // The sequence needs no seeding - that was the whole point of moving
    // off the counter row, which threw P2025 until someone remembered to
    // run a seed script. Confirm it exists and is usable.
    const rows = await prisma.$queryRaw<
      { exists: boolean }[]
    >`SELECT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'purchase_order_number_seq' AND relkind = 'S') AS exists`;
    expect(rows[0].exists).toBe(true);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("never issues the same PO number twice under concurrent calls", async () => {
    const CONCURRENT_CALLS = 25;

    const results = await Promise.all(
      Array.from({ length: CONCURRENT_CALLS }, () => nextPoNumber())
    );

    const uniqueResults = new Set(results);
    expect(uniqueResults.size).toBe(CONCURRENT_CALLS);
  });

  it("issues a contiguous block when nothing else is drawing numbers", async () => {
    const CONCURRENT_CALLS = 10;
    const results = await Promise.all(
      Array.from({ length: CONCURRENT_CALLS }, () => nextPoNumber())
    );

    const numbers = results
      .map((r) => parsePoNumber(r))
      .filter((n): n is number => n !== null)
      .sort((a, b) => a - b);

    expect(numbers).toHaveLength(CONCURRENT_CALLS);
    for (let i = 1; i < numbers.length; i++) {
      expect(numbers[i]).toBe(numbers[i - 1] + 1);
    }
  });

  it("always produces a well-formed, parseable PO number", async () => {
    const poNumber = await nextPoNumber();

    expect(poNumber).toMatch(/^PO-\d{6}$/);
    expect(parsePoNumber(poNumber)).not.toBeNull();
  });

  // Documents the deliberate tradeoff of moving to a sequence: nextval() is
  // not transactional, so numbers are never reused but may have gaps. If
  // this ever needs to change, contiguity would have to come from somewhere
  // other than the sequence.
  it("never reuses a number, even though gaps are possible", async () => {
    const first = parsePoNumber(await nextPoNumber())!;
    const second = parsePoNumber(await nextPoNumber())!;

    expect(second).toBeGreaterThan(first);
  });
});
