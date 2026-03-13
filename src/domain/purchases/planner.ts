import { createId, round } from "@/lib/utils";
import type {
  PurchaseDraftGroup,
  PurchaseDraftItem,
  PurchaseDraftItemInput,
  PurchaseDraftResult,
  PurchaseProgressInput,
  PurchaseStatusValue,
} from "./types";

function normalizeString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }

  return value;
}

export function normalizePurchaseDraftItem(input: PurchaseDraftItemInput): PurchaseDraftItem {
  const quantity = Math.max(0, normalizeNumber(input.quantity));
  const unitCost = Math.max(0, normalizeNumber(input.unitCost));

  return {
    ...input,
    lineId: normalizeString(input.lineId) ?? createId(),
    materialId: normalizeString(input.materialId),
    supplierId: normalizeString(input.supplierId),
    supplierName: normalizeString(input.supplierName),
    description: input.description.trim(),
    quantity,
    unit: input.unit.trim() || "unidad",
    unitCost,
    subtotal: round(quantity * unitCost, 2),
    sourceLineId: normalizeString(input.sourceLineId),
    sourceLineLabel: normalizeString(input.sourceLineLabel),
  };
}

function buildConsolidationKey(item: PurchaseDraftItem) {
  const materialKey = item.materialId
    ? `material:${item.materialId}`
    : `desc:${item.description.trim().toLowerCase()}`;

  return [
    item.sourceType,
    item.sourceId,
    item.supplierId ?? "no-supplier",
    materialKey,
    item.unit.trim().toLowerCase(),
  ].join("::");
}

export function consolidatePurchaseDraftItems(inputs: PurchaseDraftItemInput[]): PurchaseDraftItem[] {
  const grouped = new Map<
    string,
    PurchaseDraftItem & {
      aggregatedSubtotal: number;
      sourceLabels: Set<string>;
    }
  >();

  for (const rawItem of inputs) {
    const item = normalizePurchaseDraftItem(rawItem);
    if (item.quantity <= 0) {
      continue;
    }

    const key = buildConsolidationKey(item);
    const current = grouped.get(key);

    if (!current) {
      grouped.set(key, {
        ...item,
        aggregatedSubtotal: item.subtotal,
        sourceLabels: new Set(item.sourceLineLabel ? [item.sourceLineLabel] : []),
      });
      continue;
    }

    current.quantity = round(current.quantity + item.quantity, 4);
    current.aggregatedSubtotal = round(current.aggregatedSubtotal + item.subtotal, 2);
    current.subtotal = current.aggregatedSubtotal;
    current.unitCost = current.quantity > 0 ? round(current.aggregatedSubtotal / current.quantity, 4) : 0;
    current.supplierName = current.supplierName ?? item.supplierName;
    current.sourceLineId = current.sourceLineId ?? item.sourceLineId;
    if (item.sourceLineLabel) {
      current.sourceLabels.add(item.sourceLineLabel);
      current.sourceLineLabel = Array.from(current.sourceLabels).slice(0, 3).join(", ");
    }
  }

  return Array.from(grouped.values())
    .map((entry) => ({
      lineId: entry.lineId,
      materialId: entry.materialId,
      supplierId: entry.supplierId,
      supplierName: entry.supplierName,
      description: entry.description,
      quantity: entry.quantity,
      unit: entry.unit,
      unitCost: entry.unitCost,
      subtotal: entry.subtotal,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      sourceLineId: entry.sourceLineId,
      sourceLineLabel: entry.sourceLineLabel,
    }))
    .sort((a, b) => {
      const supplierA = a.supplierName ?? "";
      const supplierB = b.supplierName ?? "";
      if (supplierA !== supplierB) {
        return supplierA.localeCompare(supplierB);
      }

      return a.description.localeCompare(b.description);
    });
}

export function groupPurchaseDraftItems(items: PurchaseDraftItem[]): PurchaseDraftGroup[] {
  const groups = new Map<string, PurchaseDraftGroup>();

  for (const item of items) {
    const key = item.supplierId ?? "no-supplier";
    const current = groups.get(key);

    if (!current) {
      groups.set(key, {
        supplierId: item.supplierId,
        supplierName: item.supplierName,
        items: [item],
        subtotal: item.subtotal,
        totalQuantity: item.quantity,
      });
      continue;
    }

    current.items.push(item);
    current.subtotal = round(current.subtotal + item.subtotal, 2);
    current.totalQuantity = round(current.totalQuantity + item.quantity, 4);
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      items: [...group.items].sort((a, b) => a.description.localeCompare(b.description)),
    }))
    .sort((a, b) => (a.supplierName ?? "Sin proveedor").localeCompare(b.supplierName ?? "Sin proveedor"));
}

export function buildPurchaseDraft(inputs: PurchaseDraftItemInput[]): PurchaseDraftResult {
  const items = consolidatePurchaseDraftItems(inputs);
  const groups = groupPurchaseDraftItems(items);

  return {
    items,
    groups,
    summary: {
      suppliersCount: groups.length,
      itemsCount: items.length,
      subtotal: round(items.reduce((total, item) => total + item.subtotal, 0), 2),
      totalQuantity: round(items.reduce((total, item) => total + item.quantity, 0), 4),
    },
  };
}

export function resolvePurchaseItemStatus(input: PurchaseProgressInput): PurchaseStatusValue {
  const quantity = Math.max(0, normalizeNumber(input.quantity));
  const receivedQuantity = Math.max(0, normalizeNumber(input.receivedQuantity));

  if (receivedQuantity <= 0) {
    return "pending";
  }

  if (receivedQuantity >= quantity && quantity > 0) {
    return "purchased";
  }

  return "partial";
}

export function resolvePurchaseStatus(items: PurchaseProgressInput[]): PurchaseStatusValue {
  if (items.length === 0) {
    return "pending";
  }

  const statuses = items.map(resolvePurchaseItemStatus);
  if (statuses.every((status) => status === "purchased")) {
    return "purchased";
  }

  if (statuses.some((status) => status !== "pending")) {
    return "partial";
  }

  return "pending";
}
