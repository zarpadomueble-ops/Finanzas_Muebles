import type {
  EcommerceChannelKey,
  EcommerceMaterialRecord,
  EcommerceProcessRecord,
  EcommerceProductDetailRecord,
  EcommerceProductRecord,
  EcommerceProductsListFilters,
  EcommerceStatusValue,
} from "@/services/ecommerce";

export type { EcommerceProductRecord };
export type { EcommerceMaterialRecord };
export type { EcommerceProcessRecord };
export type { EcommerceProductDetailRecord };
export type { EcommerceProductsListFilters };
export type { EcommerceStatusValue };
export type { EcommerceChannelKey };

export interface EcommerceMaterialOption {
  id: string;
  codigo: string;
  nombre: string;
  unidad: string;
  costo_unitario: number;
  espesor_mm: number | null;
}
