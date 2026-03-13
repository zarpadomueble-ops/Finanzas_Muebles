import { z } from "zod";
import { PROJECT_PROCESS_OPTIONS, PROJECT_STATUS_OPTIONS } from "@/services/projects";

export const ProjectsQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.union([z.enum(PROJECT_STATUS_OPTIONS), z.literal("")]).optional(),
  client_id: z.string().trim().optional(),
  include_deleted: z.boolean().optional().default(false),
});

export const ProjectMaterialLineSchema = z.object({
  material_id: z.string().trim().min(1, "Selecciona un material."),
  consumo: z.number().min(0.0001, "El consumo debe ser mayor a 0."),
  desperdicio_pct: z.number().min(0, "Minimo 0%").max(100, "Maximo 100%"),
  costo_unitario: z.number().min(0, "El costo unitario no puede ser negativo."),
});

export const ProjectLaborLineSchema = z.object({
  proceso_key: z.enum(PROJECT_PROCESS_OPTIONS),
  proceso_nombre: z.string().trim().max(80, "Maximo 80 caracteres"),
  horas: z.number().min(0, "Las horas no pueden ser negativas.").max(9999, "Valor demasiado alto."),
  costo_hora: z.number().min(0, "El costo/hora no puede ser negativo.").nullable(),
});

export const ProjectBundleFormSchema = z.object({
  id: z.string().trim().optional(),
  client_id: z.string().trim().min(1, "Selecciona un cliente."),
  nombre_proyecto: z
    .string()
    .trim()
    .min(3, "Ingresa un nombre de proyecto.")
    .max(160, "Maximo 160 caracteres"),
  fecha: z
    .string()
    .trim()
    .refine((value) => z.string().date().safeParse(value).success, "Fecha invalida."),
  tipo_mueble: z.string().trim().max(120, "Maximo 120 caracteres"),
  ancho_mm: z.number().min(0, "No puede ser negativo.").nullable(),
  alto_mm: z.number().min(0, "No puede ser negativo.").nullable(),
  profundidad_mm: z.number().min(0, "No puede ser negativo.").nullable(),
  cantidad: z.number().int("Debe ser entero.").min(1, "Minimo 1 unidad.").max(9999, "Valor demasiado alto."),
  estado: z.enum(PROJECT_STATUS_OPTIONS),
  notas: z.string().trim().max(2000, "Maximo 2000 caracteres"),
  precio_final_manual: z.number().min(0, "No puede ser negativo.").nullable(),
  materials: z.array(ProjectMaterialLineSchema),
  labor: z.array(ProjectLaborLineSchema).min(1, "Debe existir al menos un proceso."),
});

export type ProjectMaterialLineInput = z.infer<typeof ProjectMaterialLineSchema>;
export type ProjectLaborLineInput = z.infer<typeof ProjectLaborLineSchema>;
export type ProjectBundleFormInput = z.infer<typeof ProjectBundleFormSchema>;
export type ProjectsQueryInput = z.infer<typeof ProjectsQuerySchema>;
