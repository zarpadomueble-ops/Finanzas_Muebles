export interface PurchaseAggregationInput {
  materialId: string;
  quantity: number;
}

export function groupPurchaseRequirements(items: PurchaseAggregationInput[]) {
  const grouped = new Map<string, number>();

  items.forEach((item) => {
    grouped.set(item.materialId, (grouped.get(item.materialId) ?? 0) + item.quantity);
  });

  return Array.from(grouped.entries()).map(([materialId, quantity]) => ({ materialId, quantity }));
}

