export interface TimeWindow {
  startAt: Date;
  endAt: Date | null; // null endAt means "ongoing, no known end"
}

// Two windows overlap if each starts before the other ends. An open-
// ended window (endAt: null) is treated as extending indefinitely into
// the future for this check — a resource assigned with no end date is
// considered busy for any window starting after it began.
export function windowsOverlap(a: TimeWindow, b: TimeWindow): boolean {
  const aEnd = a.endAt ?? new Date(8640000000000000); // max representable Date
  const bEnd = b.endAt ?? new Date(8640000000000000);
  return a.startAt < bEnd && b.startAt < aEnd;
}

// Returns true if `candidate` conflicts with any window in `existing`.
// Used before creating a new Assignment for a piece of equipment or a
// person, to prevent double-booking.
export function hasSchedulingConflict(
  candidate: TimeWindow,
  existing: TimeWindow[]
): boolean {
  return existing.some((window) => windowsOverlap(candidate, window));
}

// Returns the specific windows that conflict, useful for surfacing a
// helpful error message ("conflicts with assignment on Job X, June 1-5")
// rather than just a boolean.
export function findConflictingWindows<T extends TimeWindow>(
  candidate: TimeWindow,
  existing: T[]
): T[] {
  return existing.filter((window) => windowsOverlap(candidate, window));
}
