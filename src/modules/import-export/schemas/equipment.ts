import { createEquipmentSchema, type CreateEquipmentInput } from "@/modules/inventory/schemas";

// Reuses createEquipmentSchema wholesale, same reasoning as
// import-export/schemas/personnel.ts: the equipment number format check
// is worth having in exactly one place, not copied into a second schema
// that could drift from it.
export type EquipmentImportRow = CreateEquipmentInput;

// Turns a comma-separated certifications cell into the array
// createEquipmentSchema expects, and normalizes a few common ways a
// spreadsheet might spell a boolean-ish status. Equipment number, unlike
// Personnel's craft/classification, is already meant to be typed as
// digits on a real fleet spreadsheet, so it needs no label resolution -
// createEquipmentSchema's own normalizeEquipmentNumberInput already
// tolerates missing dashes and surrounding whitespace.
export function prepareImportRow(raw: Record<string, unknown>): Record<string, unknown> {
  const prepared: Record<string, unknown> = { ...raw };

  if (typeof prepared.requiredCertifications === "string") {
    prepared.requiredCertifications = prepared.requiredCertifications
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  if (typeof prepared.status === "string") {
    prepared.status = prepared.status.trim().toUpperCase();
  }
  // createEquipmentSchema wants a real number here (not z.coerce.number()),
  // matching the single-record create form, which already sends a parsed
  // Number rather than a string. ExcelJS returns a genuine number for a
  // normally-formatted numeric cell, but a text-formatted cell (or one
  // typed with a thousands separator) comes back as a string.
  if (typeof prepared.operatingHours === "string" && prepared.operatingHours.trim() !== "") {
    const parsed = Number(prepared.operatingHours.replace(/,/g, ""));
    if (!Number.isNaN(parsed)) prepared.operatingHours = parsed;
  }

  return prepared;
}

export interface EquipmentImportResult {
  valid: EquipmentImportRow[];
  errors: { row: number; message: string }[];
}

export function validateEquipmentRows(rows: unknown[]): EquipmentImportResult {
  const valid: EquipmentImportRow[] = [];
  const errors: { row: number; message: string }[] = [];

  rows.forEach((row, index) => {
    const prepared = prepareImportRow((row ?? {}) as Record<string, unknown>);
    const result = createEquipmentSchema.safeParse(prepared);
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
