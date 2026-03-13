import { calculateSuggestedPriceByMargin } from "@/domain/costing/engine";

export function calculateSuggestedPrice(cost: number, marginPct: number) {
  return calculateSuggestedPriceByMargin(cost, marginPct);
}
