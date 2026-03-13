import type {
  ProfitabilityOverview,
  ProfitabilitySourceFilter,
} from "@/domain/profitability";

export interface ProfitabilityFilters {
  search?: string;
  source?: ProfitabilitySourceFilter;
}

export type { ProfitabilityOverview };
export type { ProfitabilitySourceFilter };

