import { z } from "zod";
import { PURCHASE_SOURCE_OPTIONS, PURCHASE_STATUS_OPTIONS } from "@/domain/purchases";

function isDateLike(value: string) {
  return z.string().date().safeParse(value).success;
}

export const PurchasesQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.union([z.enum(PURCHASE_STATUS_OPTIONS), z.literal("")]).optional(),
  supplier_id: z.string().trim().optional(),
  source_type: z.union([z.enum(PURCHASE_SOURCE_OPTIONS), z.literal("")]).optional(),
  include_deleted: z.boolean().optional().default(false),
});

export const PurchaseSourceBuilderSchema = z.object({
  source_type: z.enum(PURCHASE_SOURCE_OPTIONS),
  source_id: z.string().trim().min(1, "Selecciona una fuente."),
  factor: z.number().int("Debe ser entero.").min(1, "Minimo 1."),
});

export const PurchaseDraftItemSchema = z.object({
  line_id: z.string().trim().optional(),
  material_id: z.string().trim().nullable(),
  supplier_id: z.string().trim().nullable(),
  supplier_name: z.string().trim().nullable().optional(),
  descripcion_snapshot: z
    .string()
    .trim()
    .min(2, "Ingresa una descripcion.")
    .max(200, "Maximo 200 caracteres."),
  cantidad: z.number().min(0.0001, "La cantidad debe ser mayor a 0."),
  unidad_snapshot: z.string().trim().min(1, "Ingresa una unidad.").max(40, "Maximo 40 caracteres."),
  costo_unitario_snapshot: z.number().min(0, "No puede ser negativo."),
  source_line_id: z.string().trim().nullable().optional(),
  source_line_label: z.string().trim().nullable().optional(),
});

export const PurchaseDraftFormSchema = z.object({
  source_type: z.enum(PURCHASE_SOURCE_OPTIONS),
  source_id: z.string().trim().min(1, "Selecciona una fuente."),
  source_label: z.string().trim().min(1, "Falta preparar el borrador."),
  factor: z.number().int("Debe ser entero.").min(1, "Minimo 1."),
  fecha_emision: z.string().trim().refine(isDateLike, "Fecha invalida."),
  fecha_entrega_estimada: z
    .string()
    .trim()
    .refine((value) => value === "" || isDateLike(value), "Fecha invalida."),
  moneda: z.string().trim().min(1, "Ingresa una moneda.").max(8, "Maximo 8 caracteres."),
  notas: z.string().trim().max(1000, "Maximo 1000 caracteres."),
  items: z.array(PurchaseDraftItemSchema).min(1, "Genera al menos un item."),
});

export const PurchaseItemReceiptSchema = z.object({
  cantidad_recibida: z.number().min(0, "No puede ser negativo."),
});

export const PurchaseHeaderEditSchema = z.object({
  fecha_entrega_estimada: z
    .string()
    .trim()
    .refine((value) => value === "" || isDateLike(value), "Fecha invalida.")
    .optional(),
  notas: z.string().trim().max(1000, "Maximo 1000 caracteres.").optional(),
});

export type PurchasesQueryInput = z.infer<typeof PurchasesQuerySchema>;
export type PurchaseSourceBuilderInput = z.infer<typeof PurchaseSourceBuilderSchema>;
export type PurchaseDraftItemInput = z.infer<typeof PurchaseDraftItemSchema>;
export type PurchaseDraftFormInput = z.infer<typeof PurchaseDraftFormSchema>;
export type PurchaseItemReceiptInput = z.infer<typeof PurchaseItemReceiptSchema>;
export type PurchaseHeaderEditInput = z.infer<typeof PurchaseHeaderEditSchema>;
