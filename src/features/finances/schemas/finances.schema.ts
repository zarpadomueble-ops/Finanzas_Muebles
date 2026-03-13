import { z } from "zod";

export const FinanceFormSchema = z.object({
  type: z.enum(["income", "expense"]),
  category_id: z.string().min(1, "Selecciona una categoria."),
  subcategory: z.string().trim().optional(),
  description: z.string().trim().min(3, "Ingresa una descripcion."),
  amount: z.number().positive("Ingresa un monto mayor a cero."),
  currency: z.string().trim().min(3).max(3),
  exchange_rate_to_base: z.number().positive("Ingresa una cotizacion valida."),
  payment_method: z.string().trim().optional(),
  status: z.enum(["pending", "paid", "collected", "void"]),
  record_date: z.string().min(10, "Selecciona una fecha."),
  client_id: z.string().optional(),
  supplier_id: z.string().optional(),
  custom_project_id: z.string().optional(),
  budget_id: z.string().optional(),
  notes: z.string().trim().optional(),
});

export type FinanceFormInput = z.infer<typeof FinanceFormSchema>;
