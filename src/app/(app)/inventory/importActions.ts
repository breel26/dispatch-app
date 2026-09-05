"use server";

import { revalidatePath } from "next/cache";
import {
  createPersonnel,
  updatePersonnel,
  getPersonnelByEmployeeId,
  createEquipment,
  updateEquipment,
  getEquipmentByNumber,
  createMaterial,
  updateMaterial,
  getMaterialBySku,
  adjustMaterialQuantity,
} from "@/modules/inventory/repository";
import { importPersonnelFromExcel } from "@/modules/import-export/excel/importPersonnel";
import { importEquipmentFromExcel } from "@/modules/import-export/excel/importEquipment";
import { importMaterialsFromExcel } from "@/modules/import-export/excel/importMaterials";
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
  summary?: {
    createdCount: number;
    updatedCount: number;
    // Row numbers here are 1-based against the data rows (header
    // excluded), matching what the parser already reports.
    errors: { row: number; message: string }[];
  };
}

async function readUploadedFile(formData: FormData): Promise<Buffer | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose an .xlsx file to import" };
  }
  return Buffer.from(await file.arrayBuffer());
}

export async function importPersonnelAction(
  _prevState: ImportActionState,
  formData: FormData
): Promise<ImportActionState> {
  const fileResult = await readUploadedFile(formData);
  if ("error" in fileResult) return { error: fileResult.error };

  const ctx = await requireAuthContext();
  const { valid, errors } = await importPersonnelFromExcel(fileResult);

  let createdCount = 0;
  let updatedCount = 0;
  const writeErrors = [...errors];

  for (const [index, row] of valid.entries()) {
    try {
      const existing = await getPersonnelByEmployeeId(ctx.orgId, row.employeeId);
      if (existing) {
        await updatePersonnel(ctx.orgId, existing.id, row);
        updatedCount++;
      } else {
        await createPersonnel(ctx.orgId, row);
        createdCount++;
      }
    } catch (err) {
      // A row that passed format validation can still fail here - most
      // often a second row in the same file reusing an employee id the
      // first row of this same import already claimed.
      writeErrors.push({ row: index + 1, message: toActionErrorMessage(err) });
    }
  }

  revalidatePath("/inventory/personnel");
  return { summary: { createdCount, updatedCount, errors: writeErrors } };
}

export async function importEquipmentAction(
  _prevState: ImportActionState,
  formData: FormData
): Promise<ImportActionState> {
  const fileResult = await readUploadedFile(formData);
  if ("error" in fileResult) return { error: fileResult.error };

  const ctx = await requireAuthContext();
  const { valid, errors } = await importEquipmentFromExcel(fileResult);

  let createdCount = 0;
  let updatedCount = 0;
  const writeErrors = [...errors];

  for (const [index, row] of valid.entries()) {
    try {
      const existing = await getEquipmentByNumber(ctx.orgId, row.equipmentNumber);
      if (existing) {
        await updateEquipment(ctx.orgId, existing.id, row);
        updatedCount++;
      } else {
        await createEquipment(ctx.orgId, row);
        createdCount++;
      }
    } catch (err) {
      writeErrors.push({ row: index + 1, message: toActionErrorMessage(err) });
    }
  }

  revalidatePath("/inventory/equipment");
  return { summary: { createdCount, updatedCount, errors: writeErrors } };
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
