import { z } from "zod";

export const ClientFormSchema = z.object({
  nombre: z.string().trim().min(2, "El nombre es obligatorio").max(120, "Maximo 120 caracteres"),
  telefono: z.string().trim().max(40, "Maximo 40 caracteres"),
  email: z
    .string()
    .trim()
    .max(120, "Maximo 120 caracteres")
    .refine((value) => !value || z.string().email().safeParse(value).success, "Ingresa un email valido"),
  direccion: z.string().trim().max(200, "Maximo 200 caracteres"),
  ciudad: z.string().trim().max(80, "Maximo 80 caracteres"),
  provincia: z.string().trim().max(80, "Maximo 80 caracteres"),
  notas: z.string().trim().max(1000, "Maximo 1000 caracteres"),
  canal_ingreso: z.string().trim().max(80, "Maximo 80 caracteres"),
  fecha_alta: z
    .string()
    .trim()
    .refine((value) => !value || z.string().date().safeParse(value).success, "Fecha invalida"),
});

export const ClientsQuerySchema = z.object({
  search: z.string().trim().optional(),
  ciudad: z.string().trim().optional(),
  canal_ingreso: z.string().trim().optional(),
  include_deleted: z.boolean().optional().default(false),
});

export type ClientFormInput = z.infer<typeof ClientFormSchema>;
export type ClientsQueryInput = z.infer<typeof ClientsQuerySchema>;
