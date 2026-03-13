import type { ProfitabilityFilters } from "../types";
import { profitabilityFeatureService } from "../services";

export async function getProfitabilityOverviewRecord(filters: ProfitabilityFilters = {}) {
  return profitabilityFeatureService.getOverview(filters);
}

