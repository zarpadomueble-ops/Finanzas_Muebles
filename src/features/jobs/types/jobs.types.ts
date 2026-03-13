import type {
  JobBoardBudgetPreview,
  JobBoardClientPreview,
  JobBoardDetailRecord,
  JobBoardProjectPreview,
  JobBoardRecord,
  JobBoardStatusValue,
  JobsBoardListFilters,
} from "@/services/jobs-board";

export type { JobBoardRecord };
export type { JobBoardDetailRecord };
export type { JobsBoardListFilters };
export type { JobBoardStatusValue };
export type { JobBoardClientPreview };
export type { JobBoardProjectPreview };
export type { JobBoardBudgetPreview };

export interface JobClientOption {
  id: string;
  nombre: string;
}

export interface JobProjectOption {
  id: string;
  nombre: string;
  client_id: string | null;
  client_nombre: string | null;
  status: string;
}

export interface JobBudgetOption {
  id: string;
  budget_number: string;
  client_id: string | null;
  client_nombre: string | null;
  custom_project_id: string | null;
  project_nombre: string | null;
  total_snapshot: number;
  sena_snapshot: number;
  saldo_snapshot: number;
  status: string;
}

export type JobBoardDateScope = "all" | "overdue" | "today" | "next_7_days" | "scheduled" | "without_date";
export type JobBoardViewMode = "kanban" | "date";
