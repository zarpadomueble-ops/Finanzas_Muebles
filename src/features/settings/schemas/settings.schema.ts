import { z } from "zod";

export const SettingsFormSchema = z
  .object({
    horas_productivas_mes: z
      .number()
      .min(1, "Debe ser mayor a 0")
      .max(744, "Maximo 744 horas por mes"),
    costos_fijos_mes: z.number().min(0, "No puede ser negativo").max(999999999, "Valor demasiado alto"),
    costo_hora_taller: z.number().min(0, "No puede ser negativo").max(999999, "Valor demasiado alto"),
    usar_costo_hora_taller_manual: z.boolean(),
    desperdicio_melamina_pct: z.number().min(0, "Minimo 0%").max(100, "Maximo 100%"),
    margen_medida_pct: z.number().min(0, "Minimo 0%").max(100, "Maximo 100%"),
    margen_ecommerce_pct: z.number().min(0, "Minimo 0%").max(100, "Maximo 100%"),
    impuestos_pct: z.number().min(0, "Minimo 0%").max(100, "Maximo 100%"),
    publicidad_pct: z.number().min(0, "Minimo 0%").max(100, "Maximo 100%"),
    comision_cobro_pct: z.number().min(0, "Minimo 0%").max(100, "Maximo 100%"),
    embalaje_promedio: z.number().min(0, "No puede ser negativo").max(999999999, "Valor demasiado alto"),
    envio_promedio: z.number().min(0, "No puede ser negativo").max(999999999, "Valor demasiado alto"),
    kerf_sierra_mm: z.number().min(0, "No puede ser negativo").max(20, "Valor demasiado alto"),
    margen_perimetral_placa_mm: z
      .number()
      .min(0, "No puede ser negativo")
      .max(500, "Valor demasiado alto"),
    permitir_rotacion_por_defecto: z.boolean(),
    veta_obligatoria_por_defecto: z.boolean(),
  })
  .superRefine((value, ctx) => {
    if (value.usar_costo_hora_taller_manual) {
      if (value.costo_hora_taller <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["costo_hora_taller"],
          message: "Define un costo/hora manual valido.",
        });
      }
    }
  });

export const SettingsQuerySchema = z.object({
  include_inactive: z.boolean().optional().default(false),
});

export type SettingsFormInput = z.infer<typeof SettingsFormSchema>;
export type SettingsQueryInput = z.infer<typeof SettingsQuerySchema>;
