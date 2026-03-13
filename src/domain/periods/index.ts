import type { PeriodFilter, PeriodMonthValue, PeriodYearValue } from "@/types";

const MONTH_LABELS = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

export interface PeriodOption {
  label: string;
  value: string;
}

function padMonth(value: number) {
  return String(value).padStart(2, "0");
}

function normalizeDate(value: string) {
  return value.includes("T") ? value.slice(0, 10) : value;
}

export function getCurrentPeriodDate() {
  return new Date();
}

export function getCurrentPeriodFilter(): PeriodFilter {
  const now = getCurrentPeriodDate();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  return {
    month,
    year,
    period_key: buildPeriodKey(year, month),
  };
}

export function parsePeriodMonth(value: string | null | undefined, fallback: PeriodMonthValue): PeriodMonthValue {
  if (!value) {
    return fallback;
  }

  if (value === "all") {
    return "all";
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 12 ? parsed : fallback;
}

export function parsePeriodYear(value: string | null | undefined, fallback: PeriodYearValue): PeriodYearValue {
  if (!value) {
    return fallback;
  }

  if (value === "all") {
    return "all";
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2000 && parsed <= 2100 ? parsed : fallback;
}

export function buildPeriodKey(year: number, month: number) {
  return `${year}-${padMonth(month)}`;
}

export function buildPeriodStampFromDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const normalized = normalizeDate(value);
  const [yearPart, monthPart] = normalized.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);

  if (!Number.isInteger(year) || !Number.isInteger(month)) {
    return null;
  }

  return {
    record_date: normalized,
    year,
    month,
    period_key: buildPeriodKey(year, month),
  };
}

export function withDerivedPeriodKey(filter: {
  month: PeriodMonthValue;
  year: PeriodYearValue;
}): PeriodFilter {
  if (typeof filter.month === "number" && typeof filter.year === "number") {
    return {
      ...filter,
      period_key: buildPeriodKey(filter.year, filter.month),
    };
  }

  return {
    ...filter,
    period_key: null,
  };
}

export function getPeriodLabel(filter: PeriodFilter) {
  if (filter.month === "all" && filter.year === "all") {
    return "Historico completo";
  }

  if (filter.month === "all" && typeof filter.year === "number") {
    return `Todo ${filter.year}`;
  }

  if (typeof filter.month === "number" && filter.year === "all") {
    return `${MONTH_LABELS[filter.month - 1]} de todos los años`;
  }

  if (typeof filter.month === "number" && typeof filter.year === "number") {
    return `${MONTH_LABELS[filter.month - 1]} ${filter.year}`;
  }

  return "Periodo";
}

export function buildYearOptions(year: number, span = 6): PeriodOption[] {
  return Array.from({ length: span }, (_, index) => ({
    label: String(year - index),
    value: String(year - index),
  }));
}

export function buildMonthOptions(): PeriodOption[] {
  return MONTH_LABELS.map((label, index) => ({
    label,
    value: String(index + 1),
  }));
}

export function getPreviousConcretePeriod(filter: PeriodFilter): PeriodFilter | null {
  if (typeof filter.month !== "number" || typeof filter.year !== "number") {
    return null;
  }

  if (filter.month === 1) {
    return withDerivedPeriodKey({
      month: 12,
      year: filter.year - 1,
    });
  }

  return withDerivedPeriodKey({
    month: filter.month - 1,
    year: filter.year,
  });
}

export function matchesPeriodFilter(
  row: { period_key?: string | null; month?: number | null; year?: number | null; record_date?: string | null },
  filter: PeriodFilter,
) {
  if (filter.period_key) {
    return row.period_key === filter.period_key;
  }

  if (filter.year !== "all" && row.year !== filter.year) {
    return false;
  }

  if (filter.month !== "all" && row.month !== filter.month) {
    return false;
  }

  return true;
}
