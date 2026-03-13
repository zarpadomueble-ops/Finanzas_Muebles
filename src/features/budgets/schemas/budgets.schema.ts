import { z } from "zod";
import { BUDGET_STATUS_OPTIONS } from "@/services/budgets";

const BUDGET_LINE_CONCEPT_OPTIONS = [
  "fabricacion",
  "instalacion",
  "flete",
  "descuento",
  "otro",
] as const;

function isDateLike(value: string) {
  return z.string().date().safeParse(value).success;
}

export const BudgetsQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.union([z.enum(BUDGET_STATUS_OPTIONS), z.literal("")]).optional(),
  client_id: z.string().trim().optional(),
  include_deleted: z.boolean().optional().default(false),
});

export const BudgetLineSchema = z.object({
  concepto: z.enum(BUDGET_LINE_CONCEPT_OPTIONS),
  descripcion: z.string().trim().min(2, "Ingresa una descripcion.").max(200, "Maximo 200 caracteres."),
  cantidad: z.number().min(0.0001, "La cantidad debe ser mayor a 0."),
  precio_unitario: z.number().min(0, "El precio no puede ser negativo."),
});

export const BudgetBundleFormSchema = z.object({
  id: z.string().trim().optional(),
  client_id: z.string().trim().min(1, "Selecciona un cliente."),
  custom_project_id: z.string().trim().optional(),
  source_label: z.string().trim().max(200, "Maximo 200 caracteres."),
  fecha_emision: z.string().trim().refine(isDateLike, "Fecha invalida."),
  fecha_validez: z.string().trim().refine((value) => value === "" || isDateLike(value), "Fecha invalida."),
  forma_pago: z.string().trim().max(300, "Maximo 300 caracteres."),
  estado: z.enum(BUDGET_STATUS_OPTIONS),
  moneda: z.string().trim().min(1, "Ingresa una moneda.").max(8, "Maximo 8 caracteres."),
  descuento_tipo: z.enum(["fixed", "percent"]),
  descuento_valor: z.number().min(0, "No puede ser negativo."),
  sena: z.number().min(0, "No puede ser negativa."),
  notas: z.string().trim().max(2000, "Maximo 2000 caracteres."),
  items: z.array(BudgetLineSchema).min(1, "Agrega al menos una linea."),
}).superRefine((value, context) => {
  if (value.descuento_tipo === "percent" && value.descuento_valor > 100) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "El descuento porcentual no puede superar 100%.",
      path: ["descuento_valor"],
    });
  }

  const subtotal = value.items.reduce((acc, item) => acc + item.cantidad * item.precio_unitario, 0);
  const discountAmount =
    value.descuento_tipo === "percent"
      ? subtotal * Math.min(value.descuento_valor, 100) / 100
      : Math.min(value.descuento_valor, subtotal);
  const total = Math.max(0, subtotal - discountAmount);

  if (value.sena > total) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "La sena no puede superar el total del presupuesto.",
      path: ["sena"],
    });
  }
});

export type BudgetLineInput = z.infer<typeof BudgetLineSchema>;
export type BudgetBundleFormInput = z.infer<typeof BudgetBundleFormSchema>;
export type BudgetsQueryInput = z.infer<typeof BudgetsQuerySchema>;
