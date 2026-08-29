import { z } from "zod";
import { JOB_STATUSES } from "./types";

export const createJobSchema = z.object({
  name: z.string().min(1, "name is required"),
  siteAddress: z.string().min(1, "siteAddress is required"),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  notes: z.string().optional(),
}).refine(
  (data) => !data.startDate || !data.endDate || data.endDate >= data.startDate,
  { message: "endDate cannot be before startDate", path: ["endDate"] }
);

export type CreateJobInput = z.infer<typeof createJobSchema>;

export const updateJobSchema = z.object({
  name: z.string().min(1).optional(),
  siteAddress: z.string().min(1).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  notes: z.string().optional(),
}).refine(
  (data) => !data.startDate || !data.endDate || data.endDate >= data.startDate,
  { message: "endDate cannot be before startDate", path: ["endDate"] }
);

export type UpdateJobInput = z.infer<typeof updateJobSchema>;

export const jobStatusSchema = z.enum(
  JOB_STATUSES as [string, ...string[]]
);
