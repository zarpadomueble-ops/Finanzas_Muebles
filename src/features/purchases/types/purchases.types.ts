import type {
  PurchaseDetailRecord,
  PurchaseDraftSourceRecord,
  PurchaseRecord,
  PurchaseStatusOption,
  PurchaseSupplierPreview,
  PurchasesListFilters,
} from "@/services/purchases";
import type { PurchaseSourceType } from "@/domain/purchases";

export type { PurchaseRecord };
export type { PurchaseDetailRecord };
export type { PurchasesListFilters };
export type { PurchaseStatusOption };
export type { PurchaseSupplierPreview };
export type { PurchaseDraftSourceRecord };
export type { PurchaseSourceType };

export interface PurchaseSupplierOption {
  id: string;
  nombre: string;
}

export interface PurchaseSourceOption {
  type: PurchaseSourceType;
  id: string;
  label: string;
  description: string;
  default_factor: number;
}
