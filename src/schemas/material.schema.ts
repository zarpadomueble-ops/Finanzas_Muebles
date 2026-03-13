import { z } from "zod";

export const materialFormSchema = z.object({
  codigo: z.string().min(1),
  nombre: z.string().min(2),
  categoria: z.enum(["placas", "herrajes", "perfiles", "insumos", "logistica", "servicios"]),
  unidad: z.enum(["unidad", "m2", "m", "kg", "hora"]),
  costoUnitario: z.number().nonnegative(),
});

export type MaterialFormInput = z.infer<typeof materialFormSchema>;

