import type {
  ProjectClientPreview,
  ProjectDetailRecord,
  ProjectLaborRecord,
  ProjectMaterialRecord,
  ProjectProcessKey,
  ProjectRecord,
  ProjectsListFilters,
  ProjectStatusValue,
} from "@/services/projects";

export type { ProjectRecord };
export type { ProjectMaterialRecord };
export type { ProjectLaborRecord };
export type { ProjectDetailRecord };
export type { ProjectsListFilters };
export type { ProjectStatusValue };
export type { ProjectProcessKey };
export type { ProjectClientPreview };

export interface ProjectMaterialOption {
  id: string;
  codigo: string;
  nombre: string;
  unidad: string;
  costo_unitario: number;
  espesor_mm: number | null;
}

export interface ProjectClientOption {
  id: string;
  nombre: string;
}
