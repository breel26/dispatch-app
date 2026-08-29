// Mirrors the JobStatus enum in prisma/schema.prisma exactly. Kept as a
// plain TS union (not imported from @prisma/client) so pure business
// logic like statusTransitions.ts can be tested without needing the
// generated Prisma client. repository.ts bridges this to the real
// Prisma-generated type — see the note there.
export type JobStatus =
  | "PLANNED"
  | "ACTIVE"
  | "ON_HOLD"
  | "COMPLETED"
  | "CANCELLED";

export const JOB_STATUSES: JobStatus[] = [
  "PLANNED",
  "ACTIVE",
  "ON_HOLD",
  "COMPLETED",
  "CANCELLED",
];
