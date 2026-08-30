import { ZodError } from "zod";

// Centralizes how thrown errors get classified, so both the HTTP layer
// (apiError.ts, which formats these as NextResponse) and Server Actions
// (actionError.ts, which format these as a plain string for inline form
// display) agree on what each error means. New domain error classes
// should be added here as they're introduced — matched by `err.name`
// rather than `instanceof` so this file doesn't need to import every
// module's error classes.
export type ErrorClassification =
  | { kind: "validation"; message: string; details: unknown }
  | { kind: "business"; message: string }
  | { kind: "notFound"; message: string }
  | { kind: "internal"; message: string };

const BUSINESS_ERROR_NAMES = new Set([
  "SchedulingConflictError",
  "InsufficientStockError",
  "InvalidJobStatusTransitionError",
  "EmailNotConfiguredError",
  "VendorEmailMissingError",
]);

export function classifyError(err: unknown): ErrorClassification {
  if (err instanceof ZodError) {
    return { kind: "validation", message: "Validation failed", details: err.issues };
  }

  if (err instanceof Error) {
    if (BUSINESS_ERROR_NAMES.has(err.name)) {
      return { kind: "business", message: err.message };
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
      const field = Array.isArray(target) ? target.join(", ") : "value";
      return { kind: "business", message: `A record with this ${field} already exists` };
    }
  }

  console.error("Unhandled error:", err);
  return { kind: "internal", message: "Internal server error" };
}
