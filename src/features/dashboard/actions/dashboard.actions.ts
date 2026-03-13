import type { PeriodFilter } from "@/types";
import { dashboardFeatureService } from "../services";

export async function getDashboardOverviewRecord(filter: PeriodFilter) {
  return dashboardFeatureService.getOverview(filter);
}
