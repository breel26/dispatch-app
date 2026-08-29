// NOTE ON VERIFICATION: this file could not be typechecked or tested in
// the sandbox it was written in, because generating the Prisma Client
// requires a binary download that was network-blocked there. It follows
// correct Prisma Client API patterns as far as can be determined by
// review, but you MUST run `npm run typecheck` and add/run integration
// tests against a real Postgres instance before trusting this in
// production. Don't take this file's correctness on faith.

import { prisma } from "@/modules/shared/prisma";
import type { Job } from "@prisma/client";
import { createJobSchema, updateJobSchema, type CreateJobInput, type UpdateJobInput } from "./schemas";
import { assertValidJobStatusTransition } from "./statusTransitions";
import type { JobStatus } from "./types";

export async function createJob(input: CreateJobInput): Promise<Job> {
  const data = createJobSchema.parse(input);
  return prisma.job.create({ data });
}

export async function getJobById(id: string): Promise<Job | null> {
  return prisma.job.findUnique({ where: { id } });
}

export interface ListJobsOptions {
  status?: JobStatus;
  limit?: number;
  cursor?: string;
}

export async function listJobs(options: ListJobsOptions = {}): Promise<Job[]> {
  const { status, limit = 50, cursor } = options;
  return prisma.job.findMany({
    where: status ? { status } : undefined,
    take: limit,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
  });
}

export async function updateJob(id: string, input: UpdateJobInput): Promise<Job> {
  const data = updateJobSchema.parse(input);
  return prisma.job.update({ where: { id }, data });
}

// Status changes go through this function specifically (not the generic
// updateJob) so the status-transition rules in statusTransitions.ts are
// always enforced before writing to the DB.
export async function updateJobStatus(id: string, newStatus: JobStatus): Promise<Job> {
  const job = await prisma.job.findUniqueOrThrow({ where: { id } });
  assertValidJobStatusTransition(job.status as JobStatus, newStatus);
  return prisma.job.update({ where: { id }, data: { status: newStatus } });
}

// Soft-delete via CANCELLED status rather than a real DB delete — a
// cancelled job may still be referenced by purchase orders and
// assignments that need to stay in the historical record.
export async function cancelJob(id: string): Promise<Job> {
  return updateJobStatus(id, "CANCELLED");
}
