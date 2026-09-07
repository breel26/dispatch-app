"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import {
  createPersonnel,
  updatePersonnel,
  getPersonnelByEmployeeId,
  listEmployeeIdIndex,
  createEquipment,
  updateEquipment,
  getEquipmentByNumber,
  listEquipmentNumberIndex,
  createMaterial,
  updateMaterial,
  getMaterialBySku,
  adjustMaterialQuantity,
} from "@/modules/inventory/repository";
import { importPersonnelFromExcel } from "@/modules/import-export/excel/importPersonnel";
import { importEquipmentFromExcel } from "@/modules/import-export/excel/importEquipment";
import { importMaterialsFromExcel } from "@/modules/import-export/excel/importMaterials";
import {
  planImport,
  parseDecisions,
  type ImportDecisions,
  type PlannedRow,
} from "@/modules/import-export/importPlan";
import { nextEquipmentNumber, parseEquipmentNumber } from "@/modules/inventory/equipmentNumber";
import { nextEmployeeId } from "@/modules/inventory/employeeId";
import type { PersonnelImportRow } from "@/modules/import-export/schemas/personnel";
import type { EquipmentImportRow } from "@/modules/import-export/schemas/equipment";
import { requireAuthContext } from "@/modules/shared/currentUser";
import { toActionErrorMessage } from "@/modules/shared/actionError";

// Shared by all three importers. Row-level problems (a bad SSN format, a
// duplicate employee id) are collected here rather than aborting the
// whole file - the same "one bad row does not block the rest" behavior
// the parsing layer already gives validation errors. `error` is reserved
// for something that stops the import before any row is even attempted
// (no file selected, the file will not parse as an xlsx at all).
export interface ImportActionState {
  error?: string;
  /**
   * Set when the file cannot be committed as-is because some rows reuse a
   * number that is already taken. Nothing has been written at this point -
   * the import is waiting for the dispatcher to say, per row, whether each
   * is a correction to the existing record or a new one needing its own
   * number.
   */
  review?: ImportReview;
  summary?: {
    createdCount: number;
    updatedCount: number;
    // Row numbers here are 1-based against the data rows (header
    // excluded), matching what the parser already reports.
    errors: { row: number; message: string }[];
  };
}

export interface ImportReview {
  /**
   * Digest of the analyzed file. The commit step re-uploads and re-parses
   * the file rather than carrying parsed rows through the browser, so it
   * has to prove it is looking at the same one: decisions are keyed by row
   * number, and applying them to a different spreadsheet would write the
   * wrong records.
   *
   * Re-parsing rather than round-tripping is not just tidiness. Personnel
   * rows hold a plaintext SSN and driver license at this stage, and those
   * must never reach a Client Component.
   */
  fileHash: string;
  /** Rows whose number is free; they import without anyone being asked. */
  cleanCount: number;
  clashes: ReviewClash[];
}

export interface ReviewClash {
  row: number;
  /** The number both records want. */
  key: string;
  source: "database" | "file";
  /** Who holds it already: an existing record, or another row in this file. */
  heldBy: string;
  /** The incoming row, described the same way, so the two can be compared. */
  incoming: string;
  /** Next free number, or null when there is none left in this family. */
  suggestion: string | null;
  likelyDifferent: boolean;
}

async function readUploadedFile(formData: FormData): Promise<Buffer | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an .xlsx file to import" };
  }
  return Buffer.from(await file.arrayBuffer());
}

function hashFile(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function readDecisions(formData: FormData): ImportDecisions | null {
  const raw = formData.get("decisions");
  return parseDecisions(typeof raw === "string" ? raw : null);
}

function toReview(fileHash: string, plan: PlannedRow<unknown>[]): ImportReview {
  const clashes: ReviewClash[] = [];
  let cleanCount = 0;

  for (const planned of plan) {
    if (!planned.clash) {
      cleanCount++;
      continue;
    }
    clashes.push({
      row: planned.row,
      key: planned.key,
      source: planned.clash.source,
      heldBy: planned.clash.heldBy,
      incoming: planned.incoming,
      suggestion: planned.clash.suggestion,
      likelyDifferent: planned.clash.likelyDifferent,
    });
  }

  return { fileHash, cleanCount, clashes };
}

/**
 * Walks a plan and writes it, one row at a time.
 *
 * Rows with no clash are created. Rows with a clash need a decision:
 * overwrite the record already holding the number, or create a new record
 * at a different one. A clashing row with no decision is reported as an
 * error and skipped, never guessed at - guessing wrong here either
 * overwrites a machine that exists or duplicates one that does not.
 */
async function commitPlan<TRow>({
  orgId,
  plan,
  decisions,
  withKey,
  findExisting,
  create,
  update,
}: {
  orgId: string;
  plan: PlannedRow<TRow>[];
  decisions: ImportDecisions;
  /** Returns the row with its natural key replaced, for a renumbered create. */
  withKey: (row: TRow, key: string) => TRow;
  findExisting: (orgId: string, key: string) => Promise<{ id: string } | null>;
  create: (orgId: string, row: TRow) => Promise<unknown>;
  update: (orgId: string, id: string, row: TRow) => Promise<unknown>;
}): Promise<{
  createdCount: number;
  updatedCount: number;
  errors: { row: number; message: string }[];
}> {
  let createdCount = 0;
  let updatedCount = 0;
  const errors: { row: number; message: string }[] = [];

  for (const planned of plan) {
    try {
      if (!planned.clash) {
        await create(orgId, planned.data);
        createdCount++;
        continue;
      }

      const decision = decisions[planned.row];
      if (!decision) {
        // Reachable two ways: the form sent nothing for this row, or the
        // row only started clashing between the review and the commit
        // because the number was taken in the meantime.
        errors.push({
          row: planned.row,
          message: `${planned.key} is already in use and no choice was made for this row`,
        });
        continue;
      }

      if (decision.action === "update") {
        const existing = await findExisting(orgId, planned.key);
        if (!existing) {
          // Deleted between the review and the commit. Creating it instead
          // would be a reasonable guess and still the wrong thing to do
          // without asking.
          errors.push({
            row: planned.row,
            message: `${planned.key} no longer exists, so there was nothing to update`,
          });
          continue;
        }
        await update(orgId, existing.id, planned.data);
        updatedCount++;
        continue;
      }

      await create(orgId, withKey(planned.data, decision.key));
      createdCount++;
    } catch (err) {
      errors.push({ row: planned.row, message: toActionErrorMessage(err) });
    }
  }

  return { createdCount, updatedCount, errors };
}

export async function importPersonnelAction(
  _prevState: ImportActionState,
  formData: FormData
): Promise<ImportActionState> {
  const fileResult = await readUploadedFile(formData);
  if ("error" in fileResult) return { error: fileResult.error };

  const ctx = await requireAuthContext();
  const fileHash = hashFile(fileResult);
  const decisions = readDecisions(formData);
  const expectedHash = formData.get("fileHash");

  if (decisions && typeof expectedHash === "string" && expectedHash !== fileHash) {
    return {
      error:
        "The selected file changed since it was checked. Import it again to review the numbers in the new file.",
    };
  }

  const { valid, errors } = await importPersonnelFromExcel(fileResult);

  const existing = await listEmployeeIdIndex(ctx.orgId);
  const plan = planImport<PersonnelImportRow>({
    rows: valid,
    keyOf: (row) => row.employeeId,
    // Name only. These rows carry a plaintext SSN and driver license, and
    // this string is rendered in a Client Component.
    describeRow: (row) => `${row.firstName} ${row.lastName}`,
    existing: existing.map((p) => ({
      key: p.employeeId,
      label: `${p.firstName} ${p.lastName}`,
    })),
    suggest: (_row, taken) => nextEmployeeId(taken),
  });

  if (plan.some((planned) => planned.clash) && !decisions) {
    return { review: toReview(fileHash, plan) };
  }

  const written = await commitPlan<PersonnelImportRow>({
    orgId: ctx.orgId,
    plan,
    decisions: decisions ?? {},
    withKey: (row, key) => ({ ...row, employeeId: key }),
    findExisting: getPersonnelByEmployeeId,
    create: createPersonnel,
    update: updatePersonnel,
  });

  revalidatePath("/inventory/personnel");
  return {
    summary: {
      createdCount: written.createdCount,
      updatedCount: written.updatedCount,
      errors: [...errors, ...written.errors].sort((a, b) => a.row - b.row),
    },
  };
}

export async function importEquipmentAction(
  _prevState: ImportActionState,
  formData: FormData
): Promise<ImportActionState> {
  const fileResult = await readUploadedFile(formData);
  if ("error" in fileResult) return { error: fileResult.error };

  const ctx = await requireAuthContext();
  const fileHash = hashFile(fileResult);
  const decisions = readDecisions(formData);
  const expectedHash = formData.get("fileHash");

  if (decisions && typeof expectedHash === "string" && expectedHash !== fileHash) {
    return {
      error:
        "The selected file changed since it was checked. Import it again to review the numbers in the new file.",
    };
  }

  const { valid, errors } = await importEquipmentFromExcel(fileResult);

  const existing = await listEquipmentNumberIndex(ctx.orgId);
  const plan = planImport<EquipmentImportRow>({
    rows: valid,
    keyOf: (row) => row.equipmentNumber,
    describeRow: (row) => `${row.make} ${row.model} - ${row.name}`,
    existing: existing.map((e) => ({
      key: e.equipmentNumber,
      label: `${e.make} ${e.model} - ${e.name}`,
    })),
    suggest: (row, taken) => {
      // A suggestion has to stay inside the row's own type+capacity
      // family; a sequence means nothing outside it. The number is already
      // canonical here (createEquipmentSchema normalized it), so a parse
      // failure is not expected - returning null just means the review
      // screen asks for a number rather than proposing one.
      const parts = parseEquipmentNumber(row.equipmentNumber);
      if (!parts) return null;
      return nextEquipmentNumber(taken, parts.type, parts.capacity);
    },
  });

  if (plan.some((planned) => planned.clash) && !decisions) {
    return { review: toReview(fileHash, plan) };
  }

  const written = await commitPlan<EquipmentImportRow>({
    orgId: ctx.orgId,
    plan,
    decisions: decisions ?? {},
    withKey: (row, key) => ({ ...row, equipmentNumber: key }),
    findExisting: getEquipmentByNumber,
    create: createEquipment,
    update: updateEquipment,
  });

  revalidatePath("/inventory/equipment");
  return {
    summary: {
      createdCount: written.createdCount,
      updatedCount: written.updatedCount,
      errors: [...errors, ...written.errors].sort((a, b) => a.row - b.row),
    },
  };
}

export async function importMaterialsAction(
  _prevState: ImportActionState,
  formData: FormData
): Promise<ImportActionState> {
  const fileResult = await readUploadedFile(formData);
  if ("error" in fileResult) return { error: fileResult.error };

  const ctx = await requireAuthContext();
  const { valid, errors } = await importMaterialsFromExcel(fileResult);

  let createdCount = 0;
  let updatedCount = 0;
  const writeErrors = [...errors];

  for (const [index, row] of valid.entries()) {
    try {
      // import-export/schemas/material.ts allows reorderThreshold to be
      // null (an explicitly-cleared cell); modules/inventory/schemas.ts's
      // createMaterialSchema/updateMaterialSchema only accept it being
      // absent. Normalized once, here, rather than in each branch below.
      const reorderThreshold = row.reorderThreshold ?? undefined;

      const existing = await getMaterialBySku(ctx.orgId, row.sku);
      if (existing) {
        // quantityOnHand deliberately does not go through updateMaterial
        // (see modules/inventory/schemas.ts) - it is a ledger rollup, so
        // reconciling it to what the file says takes a recorded
        // adjustment, not a silent overwrite. Only actually applied when
        // the file's figure disagrees with what is on hand; a matching
        // quantity needs no movement row.
        await updateMaterial(ctx.orgId, existing.id, {
          name: row.name,
          unit: row.unit,
          reorderThreshold,
        });
        const delta = row.quantityOnHand - existing.quantityOnHand;
        if (delta !== 0) {
          await adjustMaterialQuantity(
            ctx.orgId,
            { materialId: existing.id, delta, reason: "Excel import: quantity reconciliation" },
            ctx.userId
          );
        }
        updatedCount++;
      } else {
        await createMaterial(ctx.orgId, { ...row, reorderThreshold }, ctx.userId);
        createdCount++;
      }
    } catch (err) {
      writeErrors.push({ row: index + 1, message: toActionErrorMessage(err) });
    }
  }

  revalidatePath("/inventory/materials");
  return { summary: { createdCount, updatedCount, errors: writeErrors } };
}
