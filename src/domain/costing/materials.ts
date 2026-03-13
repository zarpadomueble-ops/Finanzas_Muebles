import { round, safeDiv } from "@/lib/utils";
import type { TableRow } from "@/types";

export const MATERIAL_CATEGORY_OPTIONS = [
  "placas",
  "herrajes",
  "perfiles",
  "insumos",
  "logistica",
  "servicios",
] as const;

export const MATERIAL_UNIT_OPTIONS = ["unidad", "m2", "m", "kg", "hora"] as const;

export type MaterialCategoryValue = (typeof MATERIAL_CATEGORY_OPTIONS)[number];
export type MaterialUnitValue = (typeof MATERIAL_UNIT_OPTIONS)[number];

export function normalizeMaterialCategory(value: string | null | undefined): TableRow<"materials">["categoria"] {
  const normalized = value?.trim().toLowerCase() ?? "";
  return MATERIAL_CATEGORY_OPTIONS.includes(normalized as MaterialCategoryValue) ? normalized : "insumos";
}

export function normalizeMaterialUnit(value: string | null | undefined): TableRow<"materials">["unidad"] {
  const normalized = value?.trim().toLowerCase() ?? "";
  return MATERIAL_UNIT_OPTIONS.includes(normalized as MaterialUnitValue) ? normalized : "unidad";
}

export function calculateMaterialAreaM2(
  largoMm: number | null | undefined,
  anchoMm: number | null | undefined,
): number {
  if (!largoMm || !anchoMm || largoMm <= 0 || anchoMm <= 0) {
    return 0;
  }

  return round((largoMm * anchoMm) / 1000000, 4);
}

export function calculateMaterialCostPerM2(costoUnitario: number, areaM2: number): number {
  if (areaM2 <= 0) {
    return 0;
  }

  return round(safeDiv(costoUnitario, areaM2), 2);
}
