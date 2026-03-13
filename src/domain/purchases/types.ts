export const PURCHASE_SOURCE_OPTIONS = [
  "custom_project",
  "ecommerce_product",
  "cut_job",
] as const;

export const PURCHASE_STATUS_OPTIONS = ["pending", "partial", "purchased"] as const;

export type PurchaseSourceType = (typeof PURCHASE_SOURCE_OPTIONS)[number];
export type PurchaseStatusValue = (typeof PURCHASE_STATUS_OPTIONS)[number];

export interface PurchaseDraftItemInput {
  lineId?: string | null;
  materialId?: string | null;
  supplierId?: string | null;
  supplierName?: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  sourceType: PurchaseSourceType;
  sourceId: string;
  sourceLineId?: string | null;
  sourceLineLabel?: string | null;
}

export interface PurchaseDraftItem extends PurchaseDraftItemInput {
  lineId: string;
  materialId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  quantity: number;
  unit: string;
  unitCost: number;
  subtotal: number;
  sourceLineId: string | null;
  sourceLineLabel: string | null;
}

export interface PurchaseDraftGroup {
  supplierId: string | null;
  supplierName: string | null;
  items: PurchaseDraftItem[];
  subtotal: number;
  totalQuantity: number;
}

export interface PurchaseDraftSummary {
  suppliersCount: number;
  itemsCount: number;
  subtotal: number;
  totalQuantity: number;
}

export interface PurchaseDraftResult {
  items: PurchaseDraftItem[];
  groups: PurchaseDraftGroup[];
  summary: PurchaseDraftSummary;
}

export interface PurchaseProgressInput {
  quantity: number;
  receivedQuantity: number;
}

export interface PurchaseCsvHeader {
  id: string;
  supplierName: string | null;
  sourceLabel: string;
  status: string;
  issueDate: string;
  expectedDate: string | null;
  currency: string;
  notes: string | null;
}
