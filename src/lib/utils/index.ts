import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { v4 as uuid } from "uuid";
import {
  formatAreaM2,
  formatCurrencyValue,
  formatDateValue,
  formatMeasureMm,
  formatNumberValue,
  formatPercentValue,
} from "@/lib/format";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function createId() {
  return uuid();
}

export function nowIso() {
  return new Date().toISOString();
}

export function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function formatCurrency(value: number) {
  return formatCurrencyValue(value);
}

export function formatNumber(value: number, digits = 2) {
  return formatNumberValue(value, { digits });
}

export function formatPercent(value: number, digits = 1) {
  return formatPercentValue(value, { digits });
}

export function formatDate(value: string) {
  return formatDateValue(value);
}

export function formatMeasure(valueMm: number, digits = 0) {
  return formatMeasureMm(valueMm, digits);
}

export function formatArea(valueM2: number, digits = 3) {
  return formatAreaM2(valueM2, digits);
}

export function safeDiv(numerator: number, denominator: number) {
  if (!denominator) {
    return 0;
  }

  return numerator / denominator;
}

export function downloadText(filename: string, content: string, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function parseNumber(input: string | number | null | undefined) {
  const n = typeof input === "number" ? input : Number(input ?? 0);
  return Number.isFinite(n) ? n : 0;
}
