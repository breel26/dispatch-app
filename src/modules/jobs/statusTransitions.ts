import type { JobStatus } from "./types";

// Defines which JobStatus transitions are legal. Centralizing this means
// the UI, API routes, and any bulk-import logic all enforce the same
// rules instead of each reimplementing (and possibly disagreeing on)
// what counts as a valid move.
const ALLOWED_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  PLANNED: ["ACTIVE", "CANCELLED"],
  ACTIVE: ["ON_HOLD", "COMPLETED", "CANCELLED"],
  ON_HOLD: ["ACTIVE", "CANCELLED"],
  COMPLETED: [], // terminal — a completed job cannot change status
  CANCELLED: [], // terminal — a cancelled job cannot change status
};

export function isValidJobStatusTransition(
  from: JobStatus,
  to: JobStatus
): boolean {
  if (from === to) return false; // not a transition
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export class InvalidJobStatusTransitionError extends Error {
  constructor(from: JobStatus, to: JobStatus) {
    super(`Cannot move a job from ${from} to ${to}`);
    this.name = "InvalidJobStatusTransitionError";
  }
}

// Throws if the transition isn't allowed, otherwise returns silently.
// Callers (e.g. the repository's updateJobStatus) call this before
// writing to the DB, so illegal transitions never reach the database.
export function assertValidJobStatusTransition(
  from: JobStatus,
  to: JobStatus
): void {
  if (!isValidJobStatusTransition(from, to)) {
    throw new InvalidJobStatusTransitionError(from, to);
  }
}
