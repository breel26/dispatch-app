import { classifyError } from "./errorClassification";

// Server Actions can't return an HTTP response — they return a plain
// string for inline display in the form that triggered them. Same
// classification as the API layer (apiError.ts), different output shape.
export function toActionErrorMessage(err: unknown): string {
  const classification = classifyError(err);

  if (classification.kind === "validation") {
    const details = classification.details;
    if (Array.isArray(details)) {
      return details
        .map((issue: { path?: (string | number)[]; message: string }) =>
          issue.path && issue.path.length > 0
            ? `${issue.path.join(".")}: ${issue.message}`
            : issue.message
        )
        .join("; ");
    }
    return classification.message;
  }

  return classification.message;
}
