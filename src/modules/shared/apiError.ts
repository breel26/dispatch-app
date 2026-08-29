import { NextResponse } from "next/server";
import { ZodError } from "zod";

// Centralizes how thrown errors become HTTP responses, so every route
// handler doesn't reimplement the same instanceof checks. New domain
// error classes (SchedulingConflictError, InsufficientStockError, etc.)
// should be added here as they're introduced, so they map to sensible
// status codes instead of falling through to a generic 500.
export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "Validation failed", details: err.issues },
      { status: 400 }
    );
  }

  if (err instanceof Error) {
    switch (err.name) {
      case "SchedulingConflictError":
        return NextResponse.json({ error: err.message }, { status: 409 });
      case "InsufficientStockError":
        return NextResponse.json({ error: err.message }, { status: 409 });
      case "InvalidJobStatusTransitionError":
        return NextResponse.json({ error: err.message }, { status: 409 });
    }

    // Prisma's "not found" error has a recognizable code even though we
    // can't import its type here without the generated client.
    if ("code" in err && (err as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "Resource not found" }, { status: 404 });
    }
  }

  console.error("Unhandled API error:", err);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
