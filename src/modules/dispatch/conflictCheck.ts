import { hasSchedulingConflict, findConflictingWindows, type TimeWindow } from "@/modules/inventory/availability";

export interface ExistingAssignment extends TimeWindow {
  id: string;
  jobId: string;
  // Human-readable label for the job the resource is already on, e.g.
  // "1042 Riverside Bridge". Optional because the pure conflict logic does
  // not need it - it exists so the error a dispatcher reads can say which
  // job they are colliding with instead of just "there is a conflict".
  jobLabel?: string;
}

// Only Personnel and Equipment assignments are time-window resources that
// can double-book - a Material "assignment" consumes stock rather than
// occupying a schedule slot, so conflict checking does not apply to it.
// Callers should only call this for PERSONNEL/EQUIPMENT resource types.
//
// This is a pre-check for a good error message, not the guarantee. The
// guarantee is the EXCLUDE constraint on Assignment (see schema.prisma);
// this cannot be race-free on its own and does not try to be.
export function checkAssignmentConflict(
  candidate: TimeWindow,
  existingForSameResource: ExistingAssignment[]
): { hasConflict: boolean; conflictingWith: ExistingAssignment[] } {
  const conflictingWith = findConflictingWindows(candidate, existingForSameResource);
  return { hasConflict: conflictingWith.length > 0, conflictingWith };
}

export function wouldDoubleBook(
  candidate: TimeWindow,
  existingForSameResource: ExistingAssignment[]
): boolean {
  return hasSchedulingConflict(candidate, existingForSameResource);
}
