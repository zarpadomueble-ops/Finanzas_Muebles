import { calculateBreakEvenPoint, calculateRealMarginPct, calculateUtility } from "@/domain/costing/engine";
import { round } from "@/lib/utils";

export interface AnalyticsNamedValuePoint {
  label: string;
  value: number;
}

export interface AnalyticsMonthlyPoint {
  monthKey: string;
  monthLabel: string;
  revenue: number;
  cost: number;
  utility: number;
}

export interface DashboardBudgetSnapshotInput {
  id: string;
  label: string;
  issueDate: string;
  status: string;
  total: number;
  totalCost: number;
  utility: number;
  marginPct: number;
}

export interface DashboardMaterialUsageInput {
  id: string;
  materialName: string;
  category: string | null;
  quantity: number;
  cost: number;
}

export interface DashboardJobInput {
  id: string;
  status: string;
  amount: number;
}

export interface DashboardCuttingInput {
  id: string;
  status: string;
  boardsUsed: number;
  boardCost: number;
  utilizationPct: number;
}

export interface DashboardAnalyticsInput {
  budgets: DashboardBudgetSnapshotInput[];
  materials: DashboardMaterialUsageInput[];
  jobs: DashboardJobInput[];
  cuttingJobs: DashboardCuttingInput[];
}

export interface DashboardOverview {
  summary: {
    totalSales: number;
    totalCommittedCosts: number;
    totalUtility: number;
    averageMarginPct: number;
    activeProjects: number;
    consumedBoards: number;
    boardCost: number;
    averageUtilizationPct: number;
    approvedBudgets: number;
  };
  salesByMonth: AnalyticsMonthlyPoint[];
  costByCategory: AnalyticsNamedValuePoint[];
  topMaterials: Array<
    AnalyticsNamedValuePoint & {
      quantity: number;
    }
  >;
}

export type ProfitabilitySourceFilter = "all" | "project" | "ecommerce";

export interface ProfitabilityRecordInput {
  id: string;
  source: "project" | "ecommerce";
  label: string;
  reference: string | null;
  category: string | null;
  date: string;
  status: string;
  channel: string;
  cost: number;
  price: number;
  materialCost: number;
  laborCost: number;
  logisticsCost: number;
  commercialCost: number;
}

export interface ProfitabilityChannelScenarioInput {
  id: string;
  source: "project" | "ecommerce";
  label: string;
  reference: string | null;
  channel: string;
  channelLabel: string;
  date: string;
  cost: number;
  price: number;
}

export interface ProfitabilityBudgetSnapshotInput {
  id: string;
  label: string;
  source: "project" | "ecommerce" | "manual";
  issueDate: string;
  total: number;
  totalCost: number;
}

export interface ProfitabilityOverviewFilters {
  search?: string;
  source?: ProfitabilitySourceFilter;
}

export interface ProfitabilityRow {
  id: string;
  source: "project" | "ecommerce";
  label: string;
  reference: string | null;
  category: string | null;
  date: string;
  status: string;
  channel: string;
  cost: number;
  price: number;
  utility: number;
  marginPct: number;
  materialCost: number;
  laborCost: number;
  logisticsCost: number;
  commercialCost: number;
}

export interface ProfitabilityChannelMarginPoint {
  channel: string;
  label: string;
  revenue: number;
  cost: number;
  utility: number;
  marginPct: number;
  items: number;
}

export interface ProfitabilityOverview {
  summary: {
    totalRevenue: number;
    totalCost: number;
    totalUtility: number;
    averageMarginPct: number;
    projectCount: number;
    ecommerceCount: number;
  };
  rows: ProfitabilityRow[];
  costVsPrice: Array<{
    label: string;
    cost: number;
    price: number;
  }>;
  utilityByRecord: Array<{
    label: string;
    utility: number;
    marginPct: number;
  }>;
  costComposition: AnalyticsNamedValuePoint[];
  channelMargins: ProfitabilityChannelMarginPoint[];
  monthlyUtility: AnalyticsMonthlyPoint[];
  breakEvenDefaults: {
    referenceLabel: string | null;
    fixedCosts: number;
    unitPrice: number;
    unitCost: number;
    contributionMarginPerUnit: number;
    breakEvenUnits: number | null;
    breakEvenRevenue: number | null;
  };
}

function toNonNegative(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) {
    return 0;
  }

  return Math.max(0, Number(value));
}

function monthKey(dateValue: string) {
  return dateValue.slice(0, 7);
}

function monthLabelFromKey(key: string) {
  const [year, month] = key.split("-");
  const parsedYear = Number(year);
  const parsedMonth = Number(month);

  if (!Number.isFinite(parsedYear) || !Number.isFinite(parsedMonth)) {
    return key;
  }

  const date = new Date(parsedYear, parsedMonth - 1, 1);

  return new Intl.DateTimeFormat("es-AR", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

function compareMonthKeys(left: string, right: string) {
  return left.localeCompare(right);
}

function matchesSourceFilter(
  source: "project" | "ecommerce",
  filter: ProfitabilitySourceFilter,
) {
  if (filter === "all") {
    return true;
  }

  if (filter === "project") {
    return source === "project";
  }

  return source === "ecommerce";
}

function matchesSearch(
  haystackValues: Array<string | null | undefined>,
  search: string,
) {
  const normalizedSearch = search.trim().toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  const haystack = haystackValues
    .map((value) => value?.trim().toLowerCase() ?? "")
    .join(" ");

  return haystack.includes(normalizedSearch);
}

function sortByValueDescending<T extends { value: number }>(rows: T[]) {
  return [...rows].sort((left, right) => right.value - left.value);
}

function sortRowsForProfitability(rows: ProfitabilityRow[]) {
  return [...rows].sort((left, right) => {
    if (right.utility !== left.utility) {
      return right.utility - left.utility;
    }

    return right.date.localeCompare(left.date);
  });
}

export function buildDashboardOverview(input: DashboardAnalyticsInput): DashboardOverview {
  const approvedBudgets = input.budgets.filter((budget) => budget.status === "approved");
  const totalSales = round(
    approvedBudgets.reduce((acc, budget) => acc + toNonNegative(budget.total), 0),
    4,
  );
  const totalCommittedCosts = round(
    approvedBudgets.reduce((acc, budget) => acc + toNonNegative(budget.totalCost), 0),
    4,
  );
  const totalUtility = round(
    approvedBudgets.reduce((acc, budget) => acc + toNonNegative(budget.utility), 0),
    4,
  );
  const averageMarginPct = totalSales > 0 ? round((totalUtility / totalSales) * 100, 4) : 0;

  const activeStatuses = new Set(["aprobado", "en_produccion", "instalado"]);
  const activeProjects = input.jobs.filter((job) => activeStatuses.has(job.status)).length;

  const optimizedCutting = input.cuttingJobs.filter((job) => job.status === "optimized");
  const consumedBoards = optimizedCutting.reduce((acc, job) => acc + toNonNegative(job.boardsUsed), 0);
  const boardCost = round(
    optimizedCutting.reduce((acc, job) => acc + toNonNegative(job.boardCost), 0),
    4,
  );
  const averageUtilizationPct =
    optimizedCutting.length > 0
      ? round(
          optimizedCutting.reduce((acc, job) => acc + toNonNegative(job.utilizationPct), 0) /
            optimizedCutting.length,
          4,
        )
      : 0;

  const salesByMonthMap = new Map<string, AnalyticsMonthlyPoint>();
  for (const budget of approvedBudgets) {
    const key = monthKey(budget.issueDate);
    const current = salesByMonthMap.get(key) ?? {
      monthKey: key,
      monthLabel: monthLabelFromKey(key),
      revenue: 0,
      cost: 0,
      utility: 0,
    };

    current.revenue = round(current.revenue + toNonNegative(budget.total), 4);
    current.cost = round(current.cost + toNonNegative(budget.totalCost), 4);
    current.utility = round(current.utility + toNonNegative(budget.utility), 4);
    salesByMonthMap.set(key, current);
  }

  const costByCategoryMap = new Map<string, number>();
  const topMaterialsMap = new Map<string, { cost: number; quantity: number }>();

  for (const usage of input.materials) {
    const categoryLabel = usage.category?.trim() || "Sin categoria";
    costByCategoryMap.set(
      categoryLabel,
      round((costByCategoryMap.get(categoryLabel) ?? 0) + toNonNegative(usage.cost), 4),
    );

    const materialLabel = usage.materialName.trim() || "Material sin nombre";
    const current = topMaterialsMap.get(materialLabel) ?? { cost: 0, quantity: 0 };
    current.cost = round(current.cost + toNonNegative(usage.cost), 4);
    current.quantity = round(current.quantity + toNonNegative(usage.quantity), 4);
    topMaterialsMap.set(materialLabel, current);
  }

  const costByCategory = sortByValueDescending(
    Array.from(costByCategoryMap.entries()).map(([label, value]) => ({
      label,
      value,
    })),
  );

  const topMaterials = Array.from(topMaterialsMap.entries())
    .map(([label, values]) => ({
      label,
      value: values.cost,
      quantity: values.quantity,
    }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 8);

  const salesByMonth = Array.from(salesByMonthMap.values()).sort((left, right) =>
    compareMonthKeys(left.monthKey, right.monthKey),
  );

  return {
    summary: {
      totalSales,
      totalCommittedCosts,
      totalUtility,
      averageMarginPct,
      activeProjects,
      consumedBoards,
      boardCost,
      averageUtilizationPct,
      approvedBudgets: approvedBudgets.length,
    },
    salesByMonth,
    costByCategory,
    topMaterials,
  };
}

export function buildProfitabilityOverview(
  input: {
    rows: ProfitabilityRecordInput[];
    channelScenarios: ProfitabilityChannelScenarioInput[];
    budgetSnapshots: ProfitabilityBudgetSnapshotInput[];
    fixedCosts: number;
  },
  filters: ProfitabilityOverviewFilters = {},
): ProfitabilityOverview {
  const resolvedFilters: Required<ProfitabilityOverviewFilters> = {
    search: filters.search ?? "",
    source: filters.source ?? "all",
  };

  const rows = input.rows
    .filter(
      (row) =>
        matchesSourceFilter(row.source, resolvedFilters.source) &&
        matchesSearch(
          [row.label, row.reference, row.category, row.channel, row.status],
          resolvedFilters.search,
        ),
    )
    .map((row) => ({
      ...row,
      utility: calculateUtility(row.price, row.cost),
      marginPct: calculateRealMarginPct(row.price, row.cost),
      cost: round(toNonNegative(row.cost), 4),
      price: round(toNonNegative(row.price), 4),
      materialCost: round(toNonNegative(row.materialCost), 4),
      laborCost: round(toNonNegative(row.laborCost), 4),
      logisticsCost: round(toNonNegative(row.logisticsCost), 4),
      commercialCost: round(toNonNegative(row.commercialCost), 4),
    }))
    .filter((row) => row.cost > 0 || row.price > 0);

  const sortedRows = sortRowsForProfitability(rows);

  const totalRevenue = round(sortedRows.reduce((acc, row) => acc + row.price, 0), 4);
  const totalCost = round(sortedRows.reduce((acc, row) => acc + row.cost, 0), 4);
  const totalUtility = round(sortedRows.reduce((acc, row) => acc + row.utility, 0), 4);
  const averageMarginPct = totalRevenue > 0 ? round((totalUtility / totalRevenue) * 100, 4) : 0;

  const costComposition = sortByValueDescending([
    {
      label: "Materiales",
      value: round(sortedRows.reduce((acc, row) => acc + row.materialCost, 0), 4),
    },
    {
      label: "Mano de obra",
      value: round(sortedRows.reduce((acc, row) => acc + row.laborCost, 0), 4),
    },
    {
      label: "Logistica",
      value: round(sortedRows.reduce((acc, row) => acc + row.logisticsCost, 0), 4),
    },
    {
      label: "Cargos comerciales",
      value: round(sortedRows.reduce((acc, row) => acc + row.commercialCost, 0), 4),
    },
  ]).filter((row) => row.value > 0);

  const costVsPrice = sortedRows.slice(0, 8).map((row) => ({
    label: row.label,
    cost: row.cost,
    price: row.price,
  }));

  const utilityByRecord = sortedRows.slice(0, 10).map((row) => ({
    label: row.label,
    utility: row.utility,
    marginPct: row.marginPct,
  }));

  const filteredChannelScenarios = input.channelScenarios.filter(
    (scenario) =>
      matchesSourceFilter(scenario.source, resolvedFilters.source) &&
      matchesSearch(
        [scenario.label, scenario.reference, scenario.channelLabel, scenario.channel],
        resolvedFilters.search,
      ),
  );

  const channelMarginsMap = new Map<
    string,
    {
      channel: string;
      label: string;
      revenue: number;
      cost: number;
      utility: number;
      items: number;
    }
  >();

  for (const scenario of filteredChannelScenarios) {
    const current = channelMarginsMap.get(scenario.channel) ?? {
      channel: scenario.channel,
      label: scenario.channelLabel,
      revenue: 0,
      cost: 0,
      utility: 0,
      items: 0,
    };

    current.revenue = round(current.revenue + toNonNegative(scenario.price), 4);
    current.cost = round(current.cost + toNonNegative(scenario.cost), 4);
    current.utility = round(current.utility + calculateUtility(scenario.price, scenario.cost), 4);
    current.items += 1;
    channelMarginsMap.set(scenario.channel, current);
  }

  const channelMargins = Array.from(channelMarginsMap.values())
    .map((row) => ({
      ...row,
      marginPct: row.revenue > 0 ? round((row.utility / row.revenue) * 100, 4) : 0,
    }))
    .sort((left, right) => right.utility - left.utility);

  const monthlyBudgets = input.budgetSnapshots.filter(
    (budget) =>
      (resolvedFilters.source === "all" ||
        (resolvedFilters.source === "project" && budget.source === "project") ||
        (resolvedFilters.source === "ecommerce" && budget.source === "ecommerce")) &&
      matchesSearch([budget.label], resolvedFilters.search),
  );

  const monthlyUtilityMap = new Map<string, AnalyticsMonthlyPoint>();
  for (const budget of monthlyBudgets) {
    const key = monthKey(budget.issueDate);
    const current = monthlyUtilityMap.get(key) ?? {
      monthKey: key,
      monthLabel: monthLabelFromKey(key),
      revenue: 0,
      cost: 0,
      utility: 0,
    };

    current.revenue = round(current.revenue + toNonNegative(budget.total), 4);
    current.cost = round(current.cost + toNonNegative(budget.totalCost), 4);
    current.utility = round(current.utility + calculateUtility(budget.total, budget.totalCost), 4);
    monthlyUtilityMap.set(key, current);
  }

  const monthlyUtility = Array.from(monthlyUtilityMap.values()).sort((left, right) =>
    compareMonthKeys(left.monthKey, right.monthKey),
  );

  const breakEvenBaseRow = sortedRows[0] ?? null;
  const breakEven = calculateBreakEvenPoint({
    fixedCosts: input.fixedCosts,
    unitPrice: breakEvenBaseRow?.price ?? 0,
    unitCost: breakEvenBaseRow?.cost ?? 0,
  });

  return {
    summary: {
      totalRevenue,
      totalCost,
      totalUtility,
      averageMarginPct,
      projectCount: sortedRows.filter((row) => row.source === "project").length,
      ecommerceCount: sortedRows.filter((row) => row.source === "ecommerce").length,
    },
    rows: sortedRows,
    costVsPrice,
    utilityByRecord,
    costComposition,
    channelMargins,
    monthlyUtility,
    breakEvenDefaults: {
      referenceLabel: breakEvenBaseRow?.label ?? null,
      fixedCosts: round(toNonNegative(input.fixedCosts), 4),
      unitPrice: breakEvenBaseRow?.price ?? 0,
      unitCost: breakEvenBaseRow?.cost ?? 0,
      contributionMarginPerUnit: breakEven.contributionMarginPerUnit,
      breakEvenUnits: breakEven.breakEvenUnits,
      breakEvenRevenue: breakEven.breakEvenRevenue,
    },
  };
}
