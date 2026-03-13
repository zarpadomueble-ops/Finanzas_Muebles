import { round } from "@/lib/utils";
import type { CustomProjectCostSnapshot } from "@/domain/costing/custom-project";
import type { EcommerceProductCostSnapshot } from "@/domain/costing/ecommerce-product";
import { calculateUtility, calculateRealMarginPct } from "@/domain/costing/engine";

export interface BudgetCostLineInput {
  id?: string;
  concepto: "fabricacion" | "instalacion" | "flete" | "descuento" | "otro";
  descripcion: string;
  cantidad?: number;
  precioUnitario: number;
}

export interface BudgetCostLineResult extends BudgetCostLineInput {
  cantidad: number;
  subtotal: number;
}

export type BudgetDiscountType = "fixed" | "percent";

export interface BudgetCostSummary {
  lines: BudgetCostLineResult[];
  subtotal: number;
  discountType: BudgetDiscountType;
  discountValue: number;
  discountAmount: number;
  total: number;
  senia: number;
  saldo: number;
}

export interface BudgetCostSnapshot {
  source: "custom_project" | "ecommerce_product" | "manual";
  sourceCostSnapshot: CustomProjectCostSnapshot | EcommerceProductCostSnapshot | null;
  budget: BudgetCostSummary;
}

function normalizeLineCantidad(value: number | undefined) {
  if (!Number.isFinite(value ?? NaN)) {
    return 1;
  }

  return Number(value) === 0 ? 1 : Number(value);
}

export function calculateBudgetLines(lines: BudgetCostLineInput[]): BudgetCostLineResult[] {
  return lines.map((line) => {
    const cantidad = normalizeLineCantidad(line.cantidad);
    const subtotal = round(cantidad * line.precioUnitario, 4);

    return {
      ...line,
      cantidad,
      subtotal,
    };
  });
}

export function calculateBudgetSummary(params: {
  lines: BudgetCostLineInput[];
  senia: number;
  discountType?: BudgetDiscountType;
  discountValue?: number;
}): BudgetCostSummary {
  const lines = calculateBudgetLines(params.lines);
  const subtotal = round(lines.reduce((acc, line) => acc + line.subtotal, 0), 4);
  const discountType = params.discountType ?? "fixed";
  const discountValue = round(Math.max(0, Number(params.discountValue ?? 0)), 4);
  const discountAmount =
    discountType === "percent"
      ? round(subtotal * Math.min(discountValue, 100) / 100, 4)
      : round(Math.min(discountValue, subtotal), 4);
  const total = round(subtotal - discountAmount, 4);
  const senia = round(params.senia, 4);
  const saldo = round(total - senia, 4);

  return {
    lines,
    subtotal,
    discountType,
    discountValue,
    discountAmount,
    total,
    senia,
    saldo,
  };
}

export function calculateBudgetProfitability(params: {
  price: number;
  totalCost: number;
}) {
  const utilidad = calculateUtility(params.price, params.totalCost);
  const margenRealPct = calculateRealMarginPct(params.price, params.totalCost);

  return {
    utilidad,
    margenRealPct,
  };
}

export function buildBudgetCostSnapshot(params: {
  source: BudgetCostSnapshot["source"];
  sourceCostSnapshot: BudgetCostSnapshot["sourceCostSnapshot"];
  budget: BudgetCostSummary;
}): BudgetCostSnapshot {
  return {
    source: params.source,
    sourceCostSnapshot: params.sourceCostSnapshot,
    budget: params.budget,
  };
}
