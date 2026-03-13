import { z } from "zod";
import { CUT_JOB_STATUS_OPTIONS } from "@/services/cutting";

export const CuttingQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.union([z.enum(CUT_JOB_STATUS_OPTIONS), z.literal("")]).optional(),
  include_deleted: z.boolean().optional().default(false),
});

export const CuttingJobSchema = z.object({
  id: z.string().trim().optional(),
  nombre: z.string().trim().min(2, "Ingresa un nombre para el trabajo."),
  largo_placa_mm: z.number().positive("Debe ser mayor a 0."),
  ancho_placa_mm: z.number().positive("Debe ser mayor a 0."),
  kerf_mm: z.number().min(0, "No puede ser negativo."),
  margen_perimetral_mm: z.number().min(0, "No puede ser negativo."),
  desperdicio_extra_pct: z.number().min(0, "Minimo 0%").max(100, "Maximo 100%"),
  permitir_rotacion_default: z.boolean(),
  veta_default: z.boolean(),
  status: z.enum(CUT_JOB_STATUS_OPTIONS).optional(),
});

export const CuttingPartLineSchema = z.object({
  id: z.string().trim().optional(),
  pieza: z.string().trim().min(1, "Ingresa nombre de pieza.").max(180, "Maximo 180 caracteres."),
  cantidad: z.number().int("Debe ser entero").min(1, "Minimo 1."),
  largo_mm: z.number().positive("Debe ser mayor a 0."),
  ancho_mm: z.number().positive("Debe ser mayor a 0."),
  material_id: z.string().trim().min(1, "Selecciona material."),
  espesor_mm: z.number().min(0, "No puede ser negativo.").nullable(),
  rotacion_permitida: z.boolean(),
  veta_obligatoria: z.boolean(),
  canto: z.string().trim().max(120, "Maximo 120 caracteres."),
  prioridad: z.number().int("Debe ser entero").min(1, "Minimo 1").max(9, "Maximo 9"),
  observacion: z.string().trim().max(500, "Maximo 500 caracteres."),
  bloqueada: z.boolean(),
});

export const CuttingBundleFormSchema = z.object({
  job: CuttingJobSchema,
  parts: z.array(CuttingPartLineSchema).min(1, "Agrega al menos una pieza."),
});

export type CuttingQueryInput = z.infer<typeof CuttingQuerySchema>;
export type CuttingJobInput = z.infer<typeof CuttingJobSchema>;
export type CuttingPartLineInput = z.infer<typeof CuttingPartLineSchema>;
export type CuttingBundleFormInput = z.infer<typeof CuttingBundleFormSchema>;

