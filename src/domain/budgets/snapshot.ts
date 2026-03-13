import {
  buildBudgetCostSnapshot,
  calculateBudgetSummary,
  type BudgetCostLineInput,
  type BudgetCostSnapshot,
} from "@/domain/costing/budgets";

export interface BudgetSnapshotLine {
  name: string;
  unitCost: number;
  quantity: number;
}

export function buildBudgetSnapshotTotal(lines: BudgetSnapshotLine[]) {
  return lines.reduce((acc, line) => acc + line.unitCost * line.quantity, 0);
}

export function buildBudgetSnapshotFromLines(params: {
  source: BudgetCostSnapshot["source"];
  sourceCostSnapshot: BudgetCostSnapshot["sourceCostSnapshot"];
  lines: BudgetCostLineInput[];
  senia: number;
  discountType?: "fixed" | "percent";
  discountValue?: number;
}) {
  const budget = calculateBudgetSummary({
    lines: params.lines,
    senia: params.senia,
    discountType: params.discountType,
    discountValue: params.discountValue,
  });

  return buildBudgetCostSnapshot({
    source: params.source,
    sourceCostSnapshot: params.sourceCostSnapshot,
    budget,
  });
}
