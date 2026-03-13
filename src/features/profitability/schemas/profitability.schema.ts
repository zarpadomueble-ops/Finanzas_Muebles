import { z } from "zod";

export const ProfitabilityQuerySchema = z.object({
  search: z.string().trim().optional(),
  source: z.enum(["all", "project", "ecommerce"]).optional(),
});

export type ProfitabilityQueryInput = z.infer<typeof ProfitabilityQuerySchema>;

