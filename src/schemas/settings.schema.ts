import { z } from "zod";

export const settingsFormSchema = z.object({
  horasProductivasMes: z.number().positive(),
  costosFijosMes: z.number().nonnegative(),
  margenMedidaPct: z.number().min(0).max(100),
  margenEcommercePct: z.number().min(0).max(100),
  kerfSierraMm: z.number().min(0),
});

export type SettingsFormInput = z.infer<typeof settingsFormSchema>;

