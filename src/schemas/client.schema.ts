import { z } from "zod";

export const clientFormSchema = z.object({
  nombre: z.string().min(2, "El nombre es obligatorio"),
  telefono: z.string().optional(),
  email: z.string().email().or(z.literal("")).optional(),
  ciudad: z.string().optional(),
  provincia: z.string().optional(),
});

export type ClientFormInput = z.infer<typeof clientFormSchema>;

