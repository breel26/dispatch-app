// INTEGRATION TEST — requires a real Postgres database and a generated
// Prisma Client. This cannot run in the sandbox this project was built
// in (no network access to provision/reach a live Postgres instance).
// Run this yourself after `npx prisma generate` and `npx prisma migrate
// dev` against a real DATABASE_URL, ideally in CI on every PR that
// touches procurement/repository.ts.
//
// What this proves that the unit tests don't: unit tests (poNumber.test.ts)
// only check the pure formatting function. This test proves the actual
// DB-level atomicity claim made in repository.ts's comments — that two
// concurrent callers can never receive the same PO number.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { nextPoNumber } from "../repository";

const prisma = new PrismaClient();

describe("PO number generation under concurrency (integration)", () => {
  beforeAll(async () => {
    // Reset the sequence to a known state so this test is repeatable.
    await prisma.purchaseOrderSequence.upsert({
      where: { id: 1 },
      create: { id: 1, lastPoNumber: 0 },
      update: { lastPoNumber: 0 },
    });
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

  it("produces strictly increasing sequence values with no gaps under concurrency", async () => {
    await prisma.purchaseOrderSequence.update({
      where: { id: 1 },
      data: { lastPoNumber: 0 },
    });

    const CONCURRENT_CALLS = 10;
    const results = await Promise.all(
      Array.from({ length: CONCURRENT_CALLS }, () => nextPoNumber())
    );

    const numbers = results
      .map((r) => parseInt(r.replace("PO-", ""), 10))
      .sort((a, b) => a - b);

    for (let i = 0; i < numbers.length; i++) {
      expect(numbers[i]).toBe(i + 1);
    }
  });
});
