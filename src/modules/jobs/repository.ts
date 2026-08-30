import { prisma } from "@/modules/shared/prisma";
import type { Job } from "@prisma/client";
import { createJobSchema, updateJobSchema, type CreateJobInput, type UpdateJobInput } from "./schemas";
import { assertValidJobStatusTransition } from "./statusTransitions";
import type { JobStatus } from "./types";

// Every function here takes orgId as its first argument rather than
// reading it from ambient state. It is verbose on purpose: a query that
// forgets to scope by tenant will not compile, which is a much better
// failure mode than one that silently returns another company's jobs.
//
// Writes filter on { id, orgId } rather than { id } alone. A row belonging
// to another org then behaves exactly as if it did not exist (Prisma raises
// P2025, which classifies as "not found") instead of being updated across
// the tenant boundary.

// Raised instead of letting the unique index produce a bare constraint
// error, so the dispatcher is told which existing job already holds the
// number rather than just "that value is taken".
export class DuplicateJobNumberError extends Error {
  constructor(jobNumber: string, existingJobName: string) {
    super(`Job number ${jobNumber} is already used by "${existingJobName}"`);
    this.name = "DuplicateJobNumberError";
  }
}

// Job numbers stay dispatcher-supplied rather than generated the way PO
// numbers are. That asymmetry is deliberate: a PO number is created by
// this system and means nothing outside it, whereas a job number usually
// arrives from the client or the accounting system and has to match what
// is written on paperwork this app does not own.
//
// The unique index is still the guarantee - this pre-check exists to turn
// the common case into a message that names the conflict. A concurrent
// insert that slips past it still hits the index and classifies as
// "a record with this jobNumber already exists".
export async function createJob(orgId: string, input: CreateJobInput): Promise<Job> {
  const data = createJobSchema.parse(input);

  const existing = await prisma.job.findUnique({
    where: { orgId_jobNumber: { orgId, jobNumber: data.jobNumber } },
    select: { name: true },
  });
  if (existing) {
    throw new DuplicateJobNumberError(data.jobNumber, existing.name);
  }

  return prisma.job.create({ data: { ...data, orgId } });
}

export async function getJobById(orgId: string, id: string): Promise<Job | null> {
  return prisma.job.findFirst({ where: { id, orgId } });
}

export interface ListJobsOptions {
  status?: JobStatus;
  limit?: number;
  cursor?: string;
}

export async function listJobs(orgId: string, options: ListJobsOptions = {}): Promise<Job[]> {
  const { status, limit = 50, cursor } = options;
  return prisma.job.findMany({
    where: { orgId, ...(status ? { status } : {}) },
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
  });
}

export async function updateJob(orgId: string, id: string, input: UpdateJobInput): Promise<Job> {
  const data = updateJobSchema.parse(input);
  return prisma.job.update({ where: { id, orgId }, data });
}

// Status changes go through this function specifically (not the generic
// updateJob) so the status-transition rules in statusTransitions.ts are
// always enforced before writing to the DB.
export async function updateJobStatus(
  orgId: string,
  id: string,
  newStatus: JobStatus
): Promise<Job> {
  const job = await prisma.job.findFirst({ where: { id, orgId } });
  if (!job) {
    throw Object.assign(new Error("Job not found"), { code: "P2025" });
  }
  assertValidJobStatusTransition(job.status as JobStatus, newStatus);
  return prisma.job.update({ where: { id, orgId }, data: { status: newStatus } });
}

// Soft-delete via CANCELLED status rather than a real DB delete - a
// cancelled job may still be referenced by purchase orders and
// assignments that need to stay in the historical record.
export async function cancelJob(orgId: string, id: string): Promise<Job> {
  return updateJobStatus(orgId, id, "CANCELLED");
}
