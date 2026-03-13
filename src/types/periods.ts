export type PeriodMonthValue = number | "all";
export type PeriodYearValue = number | "all";

export interface PeriodFilter {
  month: PeriodMonthValue;
  year: PeriodYearValue;
  period_key?: string | null;
}

export interface PeriodStamped {
  record_date: string;
  month: number;
  year: number;
  period_key: string;
}
