import { z } from "zod";

export const createVendorSchema = z.object({
  name: z.string().min(1, "name is required"),
  email: z.string().email("must be a valid email address"),
  phone: z.string().optional(),
  categories: z.array(z.string().min(1)).default([]),
});

export type CreateVendorInput = z.infer<typeof createVendorSchema>;

export const updateVendorSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email("must be a valid email address").optional(),
  phone: z.string().optional(),
  categories: z.array(z.string().min(1)).optional(),
});

export type UpdateVendorInput = z.infer<typeof updateVendorSchema>;
