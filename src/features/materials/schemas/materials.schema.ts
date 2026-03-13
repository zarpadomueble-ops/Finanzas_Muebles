import { z } from "zod";
import {
  MATERIAL_CATEGORY_OPTIONS,
  MATERIAL_UNIT_OPTIONS,
} from "@/domain/costing/materials";

const MaterialCategorySchema = z.enum(MATERIAL_CATEGORY_OPTIONS);
const MaterialUnitSchema = z.enum(MATERIAL_UNIT_OPTIONS);

function parseNullableNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return value;
}

function parseNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) {
    return 0;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().replace(",", ".");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return value;
}

export const MaterialFormSchema = z
  .object({
    codigo: z.string().trim().min(1, "El codigo es obligatorio").max(50, "Maximo 50 caracteres"),
    nombre: z.string().trim().min(2, "El nombre es obligatorio").max(160, "Maximo 160 caracteres"),
    categoria: MaterialCategorySchema,
    unidad: MaterialUnitSchema,
    costo_unitario: z.number().min(0, "El costo unitario no puede ser negativo"),
    supplier_id: z.string().trim().max(100, "Proveedor invalido"),
    marca: z.string().trim().max(120, "Maximo 120 caracteres"),
    espesor_mm: z.number().min(0, "El espesor debe ser mayor o igual a 0").nullable(),
    largo_mm: z.number().min(0, "El largo debe ser mayor o igual a 0").nullable(),
    ancho_mm: z.number().min(0, "El ancho debe ser mayor o igual a 0").nullable(),
    tiene_veta: z.boolean(),
    activo: z.boolean(),
    favorito: z.boolean(),
    observaciones: z.string().trim().max(1000, "Maximo 1000 caracteres"),
  })
  .superRefine((value, ctx) => {
    if (value.categoria === "placas") {
      if (!value.largo_mm || value.largo_mm <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["largo_mm"],
          message: "Para placas debes indicar el largo en mm.",
        });
      }

      if (!value.ancho_mm || value.ancho_mm <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ancho_mm"],
          message: "Para placas debes indicar el ancho en mm.",
        });
      }
    }
  });

export const MaterialsQuerySchema = z.object({
  search: z.string().trim().optional(),
  categoria: z.string().trim().optional(),
  unidad: z.string().trim().optional(),
  supplier_id: z.string().trim().optional(),
  estado: z.enum(["all", "active", "inactive"]).optional().default("all"),
  include_deleted: z.boolean().optional().default(false),
});

export const MaterialCsvInputSchema = z
  .object({
    codigo: z.string().trim().min(1, "Codigo obligatorio"),
    nombre: z.string().trim().min(2, "Nombre obligatorio"),
    categoria: MaterialCategorySchema,
    unidad: MaterialUnitSchema,
    costo_unitario: z.preprocess(parseNumber, z.number().min(0, "Costo unitario invalido")),
    supplier_ref: z.string().trim().optional(),
    marca: z.string().trim().optional(),
    espesor_mm: z.preprocess(parseNullableNumber, z.number().min(0).nullable().optional()),
    largo_mm: z.preprocess(parseNullableNumber, z.number().min(0).nullable().optional()),
    ancho_mm: z.preprocess(parseNullableNumber, z.number().min(0).nullable().optional()),
    tiene_veta: z.boolean().optional().default(false),
    activo: z.boolean().optional().default(true),
    favorito: z.boolean().optional().default(false),
    observaciones: z.string().trim().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.categoria === "placas") {
      if (!value.largo_mm || value.largo_mm <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["largo_mm"],
          message: "Fila de placa sin largo valido.",
        });
      }

      if (!value.ancho_mm || value.ancho_mm <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ancho_mm"],
          message: "Fila de placa sin ancho valido.",
        });
      }
    }
  });

export type MaterialFormInput = z.infer<typeof MaterialFormSchema>;
export type MaterialsQueryInput = z.infer<typeof MaterialsQuerySchema>;
export type MaterialCsvInput = z.infer<typeof MaterialCsvInputSchema>;
