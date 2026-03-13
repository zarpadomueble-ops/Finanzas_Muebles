import { z } from "zod";
import {
  ECOMMERCE_CHANNEL_OPTIONS,
  ECOMMERCE_PROCESS_OPTIONS,
  ECOMMERCE_STATUS_OPTIONS,
} from "@/services/ecommerce";

export const EcommerceQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.union([z.enum(ECOMMERCE_STATUS_OPTIONS), z.literal("")]).optional(),
  include_deleted: z.boolean().optional().default(false),
});

export const EcommerceMaterialLineSchema = z.object({
  material_id: z.string().trim().min(1, "Selecciona un material."),
  consumo_unit: z.number().min(0.0001, "El consumo debe ser mayor a 0."),
  costo_unitario: z.number().min(0, "El costo unitario no puede ser negativo."),
});

export const EcommerceProcessLineSchema = z.object({
  proceso_key: z.enum(ECOMMERCE_PROCESS_OPTIONS),
  proceso_nombre: z.string().trim().max(80, "Maximo 80 caracteres"),
  horas_unit: z.number().min(0, "Las horas no pueden ser negativas.").max(9999, "Valor demasiado alto."),
  costo_hora: z.number().min(0, "El costo/hora no puede ser negativo.").nullable(),
});

export const EcommerceProductBundleFormSchema = z.object({
  id: z.string().trim().optional(),
  sku: z.string().trim().min(2, "SKU obligatorio.").max(80, "Maximo 80 caracteres"),
  nombre: z.string().trim().min(2, "Nombre obligatorio.").max(180, "Maximo 180 caracteres"),
  categoria: z.string().trim().max(120, "Maximo 120 caracteres"),
  precio_mercado: z.number().min(0, "No puede ser negativo.").nullable(),
  ancho_mm: z.number().min(0, "No puede ser negativo.").nullable(),
  alto_mm: z.number().min(0, "No puede ser negativo.").nullable(),
  profundidad_mm: z.number().min(0, "No puede ser negativo.").nullable(),
  unidades_lote: z.number().int("Debe ser entero.").min(1, "Minimo 1 unidad."),
  estado: z.enum(ECOMMERCE_STATUS_OPTIONS),
  embalaje_unitario: z.number().min(0, "No puede ser negativo."),
  envio_unitario: z.number().min(0, "No puede ser negativo."),
  materials: z.array(EcommerceMaterialLineSchema),
  processes: z.array(EcommerceProcessLineSchema).min(1, "Debe existir al menos un proceso."),
});

export const EcommerceChannelSimulationSchema = z.object({
  channel: z.enum(ECOMMERCE_CHANNEL_OPTIONS),
  comision_pct: z.number().min(0, "Minimo 0%").max(100, "Maximo 100%"),
  publicidad_pct: z.number().min(0, "Minimo 0%").max(100, "Maximo 100%"),
  impuestos_pct: z.number().min(0, "Minimo 0%").max(100, "Maximo 100%"),
  precio_venta: z.number().min(0, "No puede ser negativo.").nullable(),
});

export type EcommerceQueryInput = z.infer<typeof EcommerceQuerySchema>;
export type EcommerceMaterialLineInput = z.infer<typeof EcommerceMaterialLineSchema>;
export type EcommerceProcessLineInput = z.infer<typeof EcommerceProcessLineSchema>;
export type EcommerceProductBundleFormInput = z.infer<typeof EcommerceProductBundleFormSchema>;
export type EcommerceChannelSimulationInput = z.infer<typeof EcommerceChannelSimulationSchema>;
