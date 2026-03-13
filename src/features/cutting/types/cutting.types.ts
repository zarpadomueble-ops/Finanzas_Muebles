import type {
  CutJobRecord,
  CutJobStatusValue,
  CuttingDetailRecord,
  CuttingJobsListFilters,
  CuttingLayoutRecord,
  CuttingOptimizationRecord,
  CutJobPartRecord,
} from "@/services/cutting";

export type { CutJobRecord };
export type { CutJobPartRecord };
export type { CuttingLayoutRecord };
export type { CuttingDetailRecord };
export type { CuttingOptimizationRecord };
export type { CutJobStatusValue };
export type { CuttingJobsListFilters };

export interface CuttingMaterialOption {
  id: string;
  codigo: string;
  nombre: string;
  unidad: string;
  costo_unitario: number;
  espesor_mm: number | null;
  area_m2: number | null;
  largo_mm: number | null;
  ancho_mm: number | null;
}

