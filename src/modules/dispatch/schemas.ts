import { z } from "zod";

export const assignmentResourceTypeValues = ["PERSONNEL", "MATERIAL", "EQUIPMENT"] as const;

export const createAssignmentSchema = z.object({
  jobId: z.string().min(1, "jobId is required"),
  resourceType: z.enum(assignmentResourceTypeValues),
  personnelId: z.string().optional(),
  materialId: z.string().optional(),
  equipmentId: z.string().optional(),
  quantity: z.number().positive().optional(), // required for MATERIAL/EQUIPMENT, see refine below
  startAt: z.coerce.date(),
  endAt: z.coerce.date().optional(),
  notes: z.string().optional(),
})
  .refine(
    (a) => (a.personnelId ? 1 : 0) + (a.materialId ? 1 : 0) + (a.equipmentId ? 1 : 0) === 1,
    { message: "exactly one of personnelId, materialId, or equipmentId must be set" }
  )
  .refine(
    (a) => {
      // The resourceType field must match which ID was actually provided
      // — without this check, someone could send resourceType: "PERSONNEL"
      // with a materialId set, and the mismatch would only surface later
      // as a confusing DB error.
      if (a.resourceType === "PERSONNEL") return !!a.personnelId;
      if (a.resourceType === "MATERIAL") return !!a.materialId;
      if (a.resourceType === "EQUIPMENT") return !!a.equipmentId;
      return false;
    },
    { message: "resourceType does not match the provided resource id" }
  )
  .refine(
    (a) => a.resourceType === "PERSONNEL" || a.quantity != null,
    { message: "quantity is required for MATERIAL and EQUIPMENT assignments", path: ["quantity"] }
  )
  .refine(
    (a) => !a.endAt || a.endAt >= a.startAt,
    { message: "endAt cannot be before startAt", path: ["endAt"] }
  );

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
