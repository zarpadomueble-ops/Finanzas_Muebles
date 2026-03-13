import { z } from "zod";

export const DashboardQuerySchema = z.object({
  months: z.number().int().min(3).max(24).optional(),
});

export type DashboardQueryInput = z.infer<typeof DashboardQuerySchema>;

