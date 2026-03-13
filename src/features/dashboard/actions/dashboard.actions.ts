import { dashboardFeatureService } from "../services";

export async function getDashboardOverviewRecord() {
  return dashboardFeatureService.getOverview();
}

