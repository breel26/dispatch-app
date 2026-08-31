// INTEGRATION TEST - requires a real Postgres database and a generated
// Prisma Client. Run with `npm run test:integration`.
//
// What this proves that the unit tests cannot: the EXCLUDE constraints are
// real and Postgres enforces them. repository.conflict.test.ts covers the
// application logic against a mocked client; it can only prove that the
// code reacts correctly to a violation, not that a violation actually
// occurs. Double-booking is the invariant this app exists to protect, so
// it gets a test against the real database.

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createAssignment, cancelAssignment, SchedulingConflictError } from "../repository";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const ORG = "org_integration_test";

let jobId: string;
let personnelId: string;
let equipmentId: string;

describe("assignment overlap constraints (integration)", () => {
  beforeAll(async () => {
    const job = await prisma.job.create({
      data: {
        orgId: ORG,
        jobNumber: `IT-${Date.now()}`,
        name: "Overlap constraint test job",
        siteAddress: "1 Test Way",
      },
    });
    jobId = job.id;

    const person = await prisma.personnel.create({
      data: { orgId: ORG, name: "Test Operator", craft: "OPERATOR", classification: "JOURNEYMAN" },
    });
    personnelId = person.id;

    const machine = await prisma.equipment.create({
      data: { orgId: ORG, name: "Test Excavator", type: "Excavator" },
    });
    equipmentId = machine.id;
  });

  afterEach(async () => {
    await prisma.stockMovement.deleteMany({ where: { orgId: ORG } });
    await prisma.assignment.deleteMany({ where: { orgId: ORG } });
  });

  afterAll(async () => {
    await prisma.assignment.deleteMany({ where: { orgId: ORG } });
    await prisma.personnel.deleteMany({ where: { orgId: ORG } });
    await prisma.equipment.deleteMany({ where: { orgId: ORG } });
    await prisma.job.deleteMany({ where: { orgId: ORG } });
    await prisma.$disconnect();
  });

  it("refuses to book the same person for overlapping windows", async () => {
    await createAssignment(ORG, {
      jobId,
      resourceType: "PERSONNEL",
      personnelId,
      startAt: new Date("2030-01-01"),
      endAt: new Date("2030-01-10"),
    });

    await expect(
      createAssignment(ORG, {
        jobId,
        resourceType: "PERSONNEL",
        personnelId,
        startAt: new Date("2030-01-05"),
        endAt: new Date("2030-01-15"),
      })
    ).rejects.toThrow(SchedulingConflictError);
  });

  it("refuses to book the same equipment for overlapping windows", async () => {
    await createAssignment(ORG, {
      jobId,
      resourceType: "EQUIPMENT",
      equipmentId,
      quantity: 1,
      startAt: new Date("2030-02-01"),
      endAt: new Date("2030-02-10"),
    });

    await expect(
      createAssignment(ORG, {
        jobId,
        resourceType: "EQUIPMENT",
        equipmentId,
        quantity: 1,
        startAt: new Date("2030-02-09"),
        endAt: new Date("2030-02-20"),
      })
    ).rejects.toThrow(SchedulingConflictError);
  });

  // The range is half-open, so back-to-back bookings are legal. A crew
  // finishing on site A at noon can start on site B at noon.
  it("allows a booking that starts exactly when the previous one ends", async () => {
    await createAssignment(ORG, {
      jobId,
      resourceType: "PERSONNEL",
      personnelId,
      startAt: new Date("2030-03-01"),
      endAt: new Date("2030-03-10"),
    });

    await expect(
      createAssignment(ORG, {
        jobId,
        resourceType: "PERSONNEL",
        personnelId,
        startAt: new Date("2030-03-10"),
        endAt: new Date("2030-03-20"),
      })
    ).resolves.toBeTruthy();
  });

  // An open-ended assignment runs to 'infinity' in the constraint, matching
  // how availability.ts treats a null endAt.
  it("treats an open-ended assignment as occupying all future time", async () => {
    await createAssignment(ORG, {
      jobId,
      resourceType: "PERSONNEL",
      personnelId,
      startAt: new Date("2030-04-01"),
    });

    await expect(
      createAssignment(ORG, {
        jobId,
        resourceType: "PERSONNEL",
        personnelId,
        startAt: new Date("2035-01-01"),
        endAt: new Date("2035-01-02"),
      })
    ).rejects.toThrow(SchedulingConflictError);
  });

  // The reason cancellation is a soft delete rather than a hard one: the
  // slot has to actually free up, or cancelling would be useless.
  it("frees the slot once the blocking assignment is cancelled", async () => {
    const first = await createAssignment(ORG, {
      jobId,
      resourceType: "PERSONNEL",
      personnelId,
      startAt: new Date("2030-05-01"),
      endAt: new Date("2030-05-10"),
    });

    await cancelAssignment(ORG, first.id);

    await expect(
      createAssignment(ORG, {
        jobId,
        resourceType: "PERSONNEL",
        personnelId,
        startAt: new Date("2030-05-05"),
        endAt: new Date("2030-05-15"),
      })
    ).resolves.toBeTruthy();

    // ...and the cancelled row is still there, so history is intact.
    const cancelled = await prisma.assignment.findUnique({ where: { id: first.id } });
    expect(cancelled?.cancelledAt).not.toBeNull();
  });

  // The race the application-level pre-check cannot win on its own. Both
  // calls read an empty schedule; only one insert may survive.
  it("lets exactly one of two simultaneous bookings win", async () => {
    const book = () =>
      createAssignment(ORG, {
        jobId,
        resourceType: "EQUIPMENT",
        equipmentId,
        quantity: 1,
        startAt: new Date("2030-06-01"),
        endAt: new Date("2030-06-10"),
      });

    const results = await Promise.allSettled([book(), book(), book()]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(2);
  });

  it("does not stop two different people working the same window", async () => {
    const other = await prisma.personnel.create({
      data: { orgId: ORG, name: "Second Operator", craft: "OPERATOR", classification: "JOURNEYMAN" },
    });

    await createAssignment(ORG, {
      jobId,
      resourceType: "PERSONNEL",
      personnelId,
      startAt: new Date("2030-07-01"),
      endAt: new Date("2030-07-10"),
    });

    await expect(
      createAssignment(ORG, {
        jobId,
        resourceType: "PERSONNEL",
        personnelId: other.id,
        startAt: new Date("2030-07-01"),
        endAt: new Date("2030-07-10"),
      })
    ).resolves.toBeTruthy();
  });
});
