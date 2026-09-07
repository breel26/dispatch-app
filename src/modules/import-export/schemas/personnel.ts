import { createPersonnelSchema, type CreatePersonnelInput } from "@/modules/inventory/schemas";
import { CRAFT_VALUES, CLASSIFICATION_VALUES, isCraft, isClassification } from "@/modules/inventory/craft";
import type { RawRow, RowValidationResult, ValidRow } from "../rows";

// Deliberately reuses createPersonnelSchema wholesale rather than
// declaring a second, parallel schema the way material.ts does for
// Material - that pattern is fine for a few simple `.min(1)` rules, but
// duplicating the SSN/phone/postal-code regexes here would risk the two
// copies drifting apart, which is a real problem for validation this
// consequential. One schema, reused, is the point.
export type PersonnelImportRow = CreatePersonnelInput;

// A spreadsheet realistically contains "Carpenter" and "Journeyman", not
// the stored enum constants CARPENTER/JOURNEYMAN a person filling in a
// column has no reason to know. Resolves either form - the exact stored
// code or its display label, case-insensitively - before the strict enum
// check in createPersonnelSchema ever runs.
function resolveCraft(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (isCraft(upper)) return upper;
  const normalized = raw.trim().toLowerCase();
  const match = CRAFT_VALUES.find((value) => value.toLowerCase().replace(/_/g, " ") === normalized);
  return match ?? raw;
}

function resolveClassification(raw: string): string {
  const upper = raw.trim().toUpperCase();
  if (isClassification(upper)) return upper;
  const normalized = raw.trim().toLowerCase();
  const match = CLASSIFICATION_VALUES.find((value) => value.toLowerCase() === normalized);
  return match ?? raw;
}

// Applied to a raw parsed spreadsheet row before validation - resolves
// the human-friendly craft/classification text and turns a
// comma-separated certifications cell into the array createPersonnelSchema
// expects. Exported so importPersonnel.ts and any other future importer
// (a different file format, a copy-paste bulk-add form) share the exact
// same row-shaping logic rather than each reimplementing it.
export function prepareImportRow(raw: Record<string, unknown>): Record<string, unknown> {
  const prepared: Record<string, unknown> = { ...raw };

  if (typeof prepared.craft === "string") {
    prepared.craft = resolveCraft(prepared.craft);
  }
  if (typeof prepared.classification === "string") {
    prepared.classification = resolveClassification(prepared.classification);
  }
  if (typeof prepared.certifications === "string") {
    prepared.certifications = prepared.certifications
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  if (typeof prepared.isActive === "string") {
    prepared.isActive = /^(true|yes|y|1|active)$/i.test(prepared.isActive.trim());
  }

  return prepared;
}

export type PersonnelImportResult = RowValidationResult<PersonnelImportRow>;

// Validates an array of unknown rows and separates them into valid rows
// and per-row errors, the same "bad row does not block the rest of the
// import" behavior validateMaterialRows already established.
export function validatePersonnelRows(rows: RawRow[]): PersonnelImportResult {
  const valid: ValidRow<PersonnelImportRow>[] = [];
  const errors: { row: number; message: string }[] = [];

  for (const { row, raw } of rows) {
    // Rows arrive from importPersonnelFromExcel already shaped as plain
    // records (built one field at a time from named cells), so this is a
    // type-level narrowing, not a runtime guess.
    const prepared = prepareImportRow((raw ?? {}) as Record<string, unknown>);
    const result = createPersonnelSchema.safeParse(prepared);
    if (result.success) {
      valid.push({ row, data: result.data });
    } else {
      errors.push({
        row,
        message: result.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      });
    }
  }

  return { valid, errors };
}
