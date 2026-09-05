import { ZodError } from "zod";

// Centralizes how thrown errors get classified, so every layer that has
// to turn an exception into something a dispatcher reads agrees on what
// each error means. New domain error classes should be added here as they
// are introduced - matched by `err.name` rather than `instanceof` so this
// file does not need to import every module's error classes.
export type ErrorClassification =
  | { kind: "validation"; message: string; details: unknown }
  | { kind: "business"; message: string }
  | { kind: "notFound"; message: string }
  | { kind: "forbidden"; message: string }
  | { kind: "unauthenticated"; message: string }
  | { kind: "internal"; message: string };

const BUSINESS_ERROR_NAMES = new Set([
  "SchedulingConflictError",
  "InsufficientStockError",
  "InvalidJobStatusTransitionError",
  "EmailNotConfiguredError",
  "VendorEmailMissingError",
  "QuoteItemMismatchError",
  "DuplicateJobNumberError",
  "DuplicateEmployeeIdError",
  "DuplicateEquipmentNumberError",
]);

// Postgres SQLSTATE codes for the constraints added in the
// architecture-hardening migration.
const SQLSTATE_CHECK_VIOLATION = "23514";
const SQLSTATE_EXCLUSION_VIOLATION = "23P01";

// A database constraint firing means something got past the application's
// own validation. The row was correctly refused either way, but these
// messages exist so the dispatcher sees what actually went wrong rather
// than "Internal server error".
//
// The overlap constraints are the exception: those are expected to fire in
// normal use, because they are what actually prevents double-booking when
// two dispatchers book the same crew at the same instant.
const CONSTRAINT_MESSAGES: Record<string, string> = {
  assignment_personnel_no_overlap:
    "That person is already assigned to another job during this time window",
  assignment_equipment_no_overlap:
    "That equipment is already assigned to another job during this time window",
  assignment_exactly_one_resource:
    "An assignment must name exactly one person, material, or piece of equipment",
  assignment_quantity_matches_type:
    "Material and equipment assignments need a quantity; personnel assignments must not have one",
  assignment_window_ordered: "An assignment cannot end before it starts",
  quote_request_item_exactly_one_resource:
    "Each requested item must be either a material or a piece of equipment, not both",
  quote_request_item_amounts: "Requested quantities must be greater than zero",
  quote_line_item_exactly_one_resource:
    "Each quoted line must be either a material or a piece of equipment, not both",
  quote_line_item_amounts:
    "Quoted quantities must be greater than zero and prices cannot be negative",
  po_line_item_exactly_one_resource:
    "Each purchase order line must be either a material or a piece of equipment, not both",
  po_line_item_amounts:
    "Purchase order quantities must be greater than zero and prices cannot be negative",
};

interface DbConstraintFailure {
  sqlState: string;
  constraintName: string | null;
}

// Prisma 7 with a driver adapter reports a raw Postgres constraint failure
// as P2039, tucking the real SQLSTATE and message inside
// meta.driverAdapterError.cause. The shape was confirmed against the live
// database rather than assumed - see the CHECK/EXCLUDE probe in the
// architecture-hardening notes. Reads defensively so a future Prisma
// version reshaping `meta` degrades to "internal error" instead of
// throwing inside the error handler.
function readDbConstraintFailure(err: unknown): DbConstraintFailure | null {
  if (!(err instanceof Error) || !("meta" in err)) return null;

  const meta = (err as { meta?: unknown }).meta;
  if (typeof meta !== "object" || meta === null) return null;

  const adapterError = (meta as { driverAdapterError?: unknown }).driverAdapterError;
  if (typeof adapterError !== "object" || adapterError === null) return null;

  const cause = (adapterError as { cause?: unknown }).cause;
  if (typeof cause !== "object" || cause === null) return null;

  const { code, message } = cause as { code?: unknown; message?: unknown };
  if (typeof code !== "string") return null;

  const constraintName =
    typeof message === "string" ? (message.match(/constraint "([^"]+)"/)?.[1] ?? null) : null;

  return { sqlState: code, constraintName };
}

export function classifyError(err: unknown): ErrorClassification {
  if (err instanceof ZodError) {
    return { kind: "validation", message: "Validation failed", details: err.issues };
  }

  if (err instanceof Error) {
    if (err.name === "NotAuthenticatedError") {
      return { kind: "unauthenticated", message: err.message };
    }
    if (err.name === "ForbiddenError") {
      return { kind: "forbidden", message: err.message };
    }
    if (BUSINESS_ERROR_NAMES.has(err.name)) {
      return { kind: "business", message: err.message };
    }

    const dbFailure = readDbConstraintFailure(err);
    if (
      dbFailure &&
      (dbFailure.sqlState === SQLSTATE_EXCLUSION_VIOLATION ||
        dbFailure.sqlState === SQLSTATE_CHECK_VIOLATION)
    ) {
      const known = dbFailure.constraintName
        ? CONSTRAINT_MESSAGES[dbFailure.constraintName]
        : undefined;
      if (known) return { kind: "business", message: known };

      // An unrecognized constraint still beats a generic 500 - it tells
      // the dispatcher the data was rejected, not that the app broke.
      return {
        kind: "business",
        message: "That change was rejected because it would break a data rule",
      };
    }

    // Prisma's error codes are recognizable even without importing its
    // type (which would require the generated client to be present).
    const code = "code" in err ? (err as { code?: string }).code : undefined;
    if (code === "P2025") {
      return { kind: "notFound", message: "Resource not found" };
    }
    if (code === "P2003") {
      return { kind: "business", message: "Cannot complete this action: related records exist" };
    }
    if (code === "P2002") {
      const target = "meta" in err ? (err as { meta?: { target?: string[] } }).meta?.target : undefined;
      const rawTarget = Array.isArray(target) ? target.join(", ") : "value";
      // Uniqueness is per-org now, so the orgId half of a composite key is
      // noise to whoever reads the message - "a record with this orgId,
      // sku already exists" is not useful.
      const field = rawTarget
        .split(", ")
        .filter((part) => part !== "orgId")
        .join(", ") || "value";
      return { kind: "business", message: `A record with this ${field} already exists` };
    }
  }

  console.error("Unhandled error:", err);
  return { kind: "internal", message: "Internal server error" };
}
