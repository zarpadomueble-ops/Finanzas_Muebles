export interface CurrencyFormatOptions {
  currency?: string;
  locale?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
}

function clampFractionDigits(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(0, Math.min(20, Math.trunc(value ?? fallback)));
}

export function formatCurrencyValue(value: number, options: CurrencyFormatOptions = {}) {
  const {
    currency = "ARS",
    locale = "es-AR",
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
  } = options;

  const safeValue = Number.isFinite(value) ? value : 0;
  const safeMinimumFractionDigits = clampFractionDigits(minimumFractionDigits, 2);
  const safeMaximumFractionDigits = Math.max(
    safeMinimumFractionDigits,
    clampFractionDigits(maximumFractionDigits, safeMinimumFractionDigits),
  );

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: safeMinimumFractionDigits,
    maximumFractionDigits: safeMaximumFractionDigits,
  }).format(safeValue);
}

export interface PercentFormatOptions {
  locale?: string;
  digits?: number;
  fromRatio?: boolean;
}

export function formatPercentValue(value: number, options: PercentFormatOptions = {}) {
  const { locale = "es-AR", digits = 2, fromRatio = false } = options;
  const safeValue = Number.isFinite(value) ? value : 0;
  const percentValue = fromRatio ? safeValue * 100 : safeValue;
  const safeDigits = clampFractionDigits(digits, 2);

  return new Intl.NumberFormat(locale, {
    style: "percent",
    minimumFractionDigits: safeDigits,
    maximumFractionDigits: safeDigits,
  }).format(percentValue / 100);
}

export interface NumberFormatOptions {
  locale?: string;
  digits?: number;
}

export function formatNumberValue(value: number, options: NumberFormatOptions = {}) {
  const { locale = "es-AR", digits = 2 } = options;
  const safeValue = Number.isFinite(value) ? value : 0;
  const safeDigits = clampFractionDigits(digits, 2);

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: safeDigits,
  }).format(safeValue);
}

export interface DateFormatOptions {
  locale?: string;
  includeTime?: boolean;
}

export function formatDateValue(value: Date | string | null | undefined, options: DateFormatOptions = {}) {
  if (!value) {
    return "-";
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  const { locale = "es-AR", includeTime = false } = options;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: includeTime ? "short" : undefined,
  }).format(parsed);
}

export function formatMeasureMm(value: number, digits = 0) {
  return `${formatNumberValue(value, { digits })} mm`;
}

export function formatMeasureCm(value: number, digits = 1) {
  return `${formatNumberValue(value, { digits })} cm`;
}

export function formatMeasureM(value: number, digits = 2) {
  return `${formatNumberValue(value, { digits })} m`;
}

export function formatAreaM2(value: number, digits = 3) {
  return `${formatNumberValue(value, { digits })} m2`;
}
