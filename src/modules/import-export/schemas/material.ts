import { z } from "zod";

// This schema is the single source of truth for what a valid Material
// record looks like when it crosses a boundary (file upload, API
// payload, etc.). Both import and export code should validate against
// this rather than trusting shapes implicitly.
export const materialSchema = z.object({
  sku: z.string().min(1, "sku is required"),
  name: z.string().min(1, "name is required"),
  unit: z.string().min(1, "unit is required"),
  quantityOnHand: z.number().nonnegative("quantityOnHand cannot be negative"),
  reorderThreshold: z.number().nonnegative().nullable().optional(),
});

export type MaterialInput = z.infer<typeof materialSchema>;

// Validates an array of unknown rows (e.g. parsed from a spreadsheet)
// and separates them into valid rows and per-row errors, so a bad row
// doesn't block the whole import.
export function validateMaterialRows(rows: unknown[]): {
  valid: MaterialInput[];
  errors: { row: number; message: string }[];
} {
  const valid: MaterialInput[] = [];
  const errors: { row: number; message: string }[] = [];

  rows.forEach((row, index) => {
    const result = materialSchema.safeParse(row);
    if (result.success) {
      valid.push(result.data);
    } else {
      errors.push({
        row: index + 1,
        message: result.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      });
    }
  });

  return { valid, errors };
}
