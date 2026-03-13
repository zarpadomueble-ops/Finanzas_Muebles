import type {
  BudgetClientPreview,
  BudgetDetailRecord,
  BudgetProjectDraftRecord,
  BudgetProjectPreview,
  BudgetRecord,
  BudgetsListFilters,
  BudgetStatusValue,
} from "@/services/budgets";
import type { BudgetCostSummary, BudgetDiscountType } from "@/domain/costing";

export type { BudgetRecord };
export type { BudgetDetailRecord };
export type { BudgetsListFilters };
export type { BudgetStatusValue };
export type { BudgetClientPreview };
export type { BudgetProjectPreview };
export type { BudgetProjectDraftRecord };
export type { BudgetDiscountType };

export interface BudgetClientOption {
  id: string;
  nombre: string;
}

export interface BudgetProjectOption {
  id: string;
  nombre: string;
  client_id: string | null;
  client_nombre: string | null;
  precio_referencia: number;
  costo_total: number;
  status: string;
}

export interface BudgetSourceContext {
  sourceType: "custom_project" | "manual";
  sourceLabel: string;
  sourceCostTotal: number;
  sourceCostSnapshot: unknown | null;
}

export interface BudgetPreviewRecord {
  summary: BudgetCostSummary;
  profitability: {
    utilidad: number;
    margenRealPct: number;
  } | null;
}
