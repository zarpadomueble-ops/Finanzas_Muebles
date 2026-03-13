import { getPreviousConcretePeriod, matchesPeriodFilter } from "@/domain/periods";
import type { PeriodFilter } from "@/types";

export interface FinanceMetricRecord {
  id: string;
  type: "income" | "expense";
  amount_base: number;
  amount: number;
  status: string;
  period_key: string;
  month: number;
  year: number;
  record_date: string;
  description: string;
  category_label: string;
}

export interface FinanceCategorySummaryItem {
  label: string;
  value: number;
}

export interface FinanceSeriesPoint {
  period_key: string;
  label: string;
  income: number;
  expense: number;
  balance: number;
}

export interface FinanceSummary {
  totalIncome: number;
  totalExpense: number;
  monthlyBalance: number;
  marginPct: number;
  previousBalance: number | null;
  variationPct: number | null;
  topExpenses: FinanceCategorySummaryItem[];
  expenseByCategory: FinanceCategorySummaryItem[];
  incomeByCategory: FinanceCategorySummaryItem[];
  series: FinanceSeriesPoint[];
}

function roundTo(value: number, digits = 2) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function buildSeriesLabel(periodKey: string) {
  const [year, month] = periodKey.split("-");
  return `${month}/${year.slice(-2)}`;
}

function toCategorySummary(
  rows: FinanceMetricRecord[],
  type: FinanceMetricRecord["type"],
) {
  const totals = new Map<string, number>();

  for (const row of rows) {
    if (row.type !== type) {
      continue;
    }

    totals.set(row.category_label, (totals.get(row.category_label) ?? 0) + row.amount_base);
  }

  return Array.from(totals.entries())
    .map(([label, value]) => ({ label, value: roundTo(value) }))
    .sort((left, right) => right.value - left.value);
}

export function buildMonthlyFinanceSummary(
  transactions: FinanceMetricRecord[],
  filter: PeriodFilter,
): FinanceSummary {
  const scopedTransactions = transactions.filter((row) => matchesPeriodFilter(row, filter));
  const totalIncome = roundTo(
    scopedTransactions
      .filter((row) => row.type === "income")
      .reduce((total, row) => total + row.amount_base, 0),
  );
  const totalExpense = roundTo(
    scopedTransactions
      .filter((row) => row.type === "expense")
      .reduce((total, row) => total + row.amount_base, 0),
  );
  const monthlyBalance = roundTo(totalIncome - totalExpense);
  const marginPct = totalIncome > 0 ? roundTo(((totalIncome - totalExpense) / totalIncome) * 100) : 0;

  const previousPeriod = getPreviousConcretePeriod(filter);
  const previousBalance = previousPeriod
    ? roundTo(
        transactions
          .filter((row) => matchesPeriodFilter(row, previousPeriod))
          .reduce((total, row) => total + (row.type === "income" ? row.amount_base : -row.amount_base), 0),
      )
    : null;

  const variationPct =
    previousBalance !== null && previousBalance !== 0
      ? roundTo(((monthlyBalance - previousBalance) / Math.abs(previousBalance)) * 100)
      : null;

  const seriesMap = new Map<string, FinanceSeriesPoint>();
  for (const row of transactions) {
    const existing = seriesMap.get(row.period_key) ?? {
      period_key: row.period_key,
      label: buildSeriesLabel(row.period_key),
      income: 0,
      expense: 0,
      balance: 0,
    };

    if (row.type === "income") {
      existing.income += row.amount_base;
    } else {
      existing.expense += row.amount_base;
    }

    existing.balance = existing.income - existing.expense;
    seriesMap.set(row.period_key, existing);
  }

  return {
    totalIncome,
    totalExpense,
    monthlyBalance,
    marginPct,
    previousBalance,
    variationPct,
    topExpenses: toCategorySummary(scopedTransactions, "expense").slice(0, 5),
    expenseByCategory: toCategorySummary(scopedTransactions, "expense"),
    incomeByCategory: toCategorySummary(scopedTransactions, "income"),
    series: Array.from(seriesMap.values()).sort((left, right) => left.period_key.localeCompare(right.period_key)),
  };
}
