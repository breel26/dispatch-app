import { hasSchedulingConflict, findConflictingWindows, type TimeWindow } from "@/modules/inventory/availability";

export interface ExistingAssignment extends TimeWindow {
  id: string;
  jobId: string;
}

// Only Personnel and Equipment assignments are time-window resources
// that can double-book — a Material "assignment" consumes stock rather
// than occupying a schedule slot, so conflict checking doesn't apply to
// it. Callers should only call this for PERSONNEL/EQUIPMENT resource
// types.
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
