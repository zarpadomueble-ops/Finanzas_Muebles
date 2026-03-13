import { z } from "zod";
import { JOB_BOARD_STATUS_OPTIONS } from "@/services/jobs-board";

function isDateLike(value: string) {
  return z.string().date().safeParse(value).success;
}

export const JobsQuerySchema = z.object({
  search: z.string().trim().optional(),
  status: z.union([z.enum(JOB_BOARD_STATUS_OPTIONS), z.literal("")]).optional(),
  client_id: z.string().trim().optional(),
  date_scope: z.enum(["all", "overdue", "today", "next_7_days", "scheduled", "without_date"]).optional(),
  view_mode: z.enum(["kanban", "date"]).optional(),
  include_deleted: z.boolean().optional().default(false),
});

export const JobBoardFormSchema = z
  .object({
    id: z.string().trim().optional(),
    client_id: z.string().trim().min(1, "Selecciona un cliente."),
    custom_project_id: z.string().trim().optional(),
    budget_id: z.string().trim().optional(),
    titulo: z.string().trim().min(2, "Ingresa un titulo.").max(160, "Maximo 160 caracteres."),
    estado: z.enum(JOB_BOARD_STATUS_OPTIONS),
    monto_snapshot: z.number().min(0, "El monto no puede ser negativo."),
    sena_snapshot: z.number().min(0, "La sena no puede ser negativa."),
    fecha_prometida: z.string().trim().refine((value) => value === "" || isDateLike(value), "Fecha invalida."),
    fecha_inicio: z.string().trim().refine((value) => value === "" || isDateLike(value), "Fecha invalida."),
    fecha_entrega: z.string().trim().refine((value) => value === "" || isDateLike(value), "Fecha invalida."),
    avance_pct: z.number().min(0, "El avance no puede ser menor a 0.").max(100, "El avance no puede superar 100."),
    prioridad: z.number().int().min(1, "Minimo 1.").max(5, "Maximo 5."),
    notas: z.string().trim().max(2000, "Maximo 2000 caracteres."),
  })
  .superRefine((value, context) => {
    if (value.sena_snapshot > value.monto_snapshot) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La sena no puede superar el monto.",
        path: ["sena_snapshot"],
      });
    }

    if (value.fecha_inicio && value.fecha_entrega && value.fecha_entrega < value.fecha_inicio) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "La fecha de entrega no puede ser anterior al inicio.",
        path: ["fecha_entrega"],
      });
    }
  });

export type JobsQueryInput = z.infer<typeof JobsQuerySchema>;
export type JobBoardFormInput = z.infer<typeof JobBoardFormSchema>;
