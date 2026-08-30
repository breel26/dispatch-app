import { NextResponse } from "next/server";
import { classifyError } from "./errorClassification";

// Centralizes how thrown errors become HTTP responses, so every route
// handler doesn't reimplement the same instanceof checks. The actual
// classification lives in errorClassification.ts, shared with Server
// Actions (actionError.ts) so both layers agree on what each error means.
export function handleApiError(err: unknown): NextResponse {
  const classification = classifyError(err);

  switch (classification.kind) {
    case "validation":
      return NextResponse.json(
        { error: classification.message, details: classification.details },
        { status: 400 }
      );
    case "business":
      return NextResponse.json({ error: classification.message }, { status: 409 });
    case "notFound":
      return NextResponse.json({ error: classification.message }, { status: 404 });
    case "internal":
      return NextResponse.json({ error: classification.message }, { status: 500 });
  }
}
