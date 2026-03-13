import type { CostingGlobalSettingsInput } from "@/domain/costing";
import { clientsService } from "@/services/clients";
import { materialsService } from "@/services/materials";
import {
  PROJECT_PROCESS_LABELS,
  PROJECT_PROCESS_OPTIONS,
  PROJECT_STATUS_OPTIONS,
  projectsService,
  type ProjectBundleMutationInput,
  type ProjectDetailRecord,
  type ProjectProcessKey,
} from "@/services/projects";
import { settingsService } from "@/services/settings";
import type { ProjectBundleFormInput, ProjectLaborLineInput, ProjectsQueryInput } from "../schemas";
import type { ProjectClientOption, ProjectMaterialOption } from "../types";

function normalizeDateValue(value: string | null | undefined) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }

  return value.includes("T") ? value.slice(0, 10) : value;
}

function normalizeNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }

  return value;
}

function normalizeNullableNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function normalizeString(value: string | null | undefined) {
  return value?.trim() || "";
}

function normalizeProcessKey(value: string): ProjectProcessKey {
  const normalized = value.trim().toLowerCase();
  return PROJECT_PROCESS_OPTIONS.includes(normalized as ProjectProcessKey)
    ? (normalized as ProjectProcessKey)
    : "diseno";
}

function normalizeStatus(value: string): ProjectBundleFormInput["estado"] {
  const normalized = value.trim().toLowerCase();
  return PROJECT_STATUS_OPTIONS.includes(normalized as ProjectBundleFormInput["estado"])
    ? (normalized as ProjectBundleFormInput["estado"])
    : "draft";
}

function mapProjectBundlePayload(
  input: ProjectBundleFormInput,
  params: { projectId?: string } = {},
): ProjectBundleMutationInput {
  return {
    project: {
      id: params.projectId ?? input.id,
      client_id: input.client_id.trim(),
      nombre_proyecto: input.nombre_proyecto.trim(),
      fecha: normalizeDateValue(input.fecha),
      tipo_mueble: normalizeString(input.tipo_mueble),
      ancho_mm: normalizeNullableNumber(input.ancho_mm),
      alto_mm: normalizeNullableNumber(input.alto_mm),
      profundidad_mm: normalizeNullableNumber(input.profundidad_mm),
      cantidad: Math.max(1, Math.floor(normalizeNumber(input.cantidad))),
      estado: input.estado,
      notas: normalizeString(input.notas),
      precio_final_manual: normalizeNullableNumber(input.precio_final_manual),
    },
    materials: input.materials.map((line) => ({
      material_id: line.material_id.trim(),
      consumo: Math.max(0, normalizeNumber(line.consumo)),
      desperdicio_pct: Math.max(0, normalizeNumber(line.desperdicio_pct)),
      costo_unitario: Math.max(0, normalizeNumber(line.costo_unitario)),
    })),
    labor: input.labor.map((line) => {
      const processKey = normalizeProcessKey(line.proceso_key);
      return {
        proceso_key: processKey,
        proceso_nombre: normalizeString(line.proceso_nombre) || PROJECT_PROCESS_LABELS[processKey],
        horas: Math.max(0, normalizeNumber(line.horas)),
        costo_hora: normalizeNullableNumber(line.costo_hora),
      };
    }),
  };
}

function mapSettingsToCostingInput(settings: Awaited<ReturnType<typeof settingsService.getCurrent>>): CostingGlobalSettingsInput {
  return {
    horasProductivasMes: settings.horas_productivas_mes,
    costosFijosMes: settings.costos_fijos_mes,
    costoHoraTaller: settings.costo_hora_taller,
    desperdicioMelaminaPct: settings.desperdicio_melamina_pct,
    margenMedidaPct: settings.margen_medida_pct,
    margenEcommercePct: settings.margen_ecommerce_pct,
    impuestosPct: settings.impuestos_pct,
    publicidadPct: settings.publicidad_pct,
    comisionCobroPct: settings.comision_cobro_pct,
    embalajePromedio: settings.embalaje_promedio,
    envioPromedio: settings.envio_promedio,
  };
}

export function buildDefaultProjectLaborLines(defaultCostHour: number | null = null): ProjectLaborLineInput[] {
  return PROJECT_PROCESS_OPTIONS.map((processKey) => ({
    proceso_key: processKey,
    proceso_nombre: PROJECT_PROCESS_LABELS[processKey],
    horas: 0,
    costo_hora: defaultCostHour,
  }));
}

export function createEmptyProjectFormInput(
  params: {
    defaultCostHour?: number | null;
    date?: string;
  } = {},
): ProjectBundleFormInput {
  return {
    client_id: "",
    nombre_proyecto: "",
    fecha: params.date ?? new Date().toISOString().slice(0, 10),
    tipo_mueble: "",
    ancho_mm: null,
    alto_mm: null,
    profundidad_mm: null,
    cantidad: 1,
    estado: "draft",
    notas: "",
    precio_final_manual: null,
    materials: [],
    labor: buildDefaultProjectLaborLines(params.defaultCostHour ?? null),
  };
}

export function mapProjectDetailToFormInput(
  detail: ProjectDetailRecord,
  defaultCostHour: number | null = null,
): ProjectBundleFormInput {
  const mappedLabor = detail.labor.map((line) => {
    const processKey = normalizeProcessKey(line.proceso_key);
    return {
      proceso_key: processKey,
      proceso_nombre: line.proceso_nombre || PROJECT_PROCESS_LABELS[processKey],
      horas: Number(line.horas ?? 0),
      costo_hora: line.costo_hora_snapshot ?? defaultCostHour,
    } satisfies ProjectLaborLineInput;
  });

  return {
    id: detail.project.id,
    client_id: detail.project.client_id ?? "",
    nombre_proyecto: detail.project.nombre_proyecto ?? "",
    fecha: normalizeDateValue(detail.project.fecha),
    tipo_mueble: detail.project.tipo_mueble ?? "",
    ancho_mm: detail.project.ancho ?? null,
    alto_mm: detail.project.alto ?? null,
    profundidad_mm: detail.project.profundidad ?? null,
    cantidad: Number(detail.project.cantidad ?? 1),
    estado: normalizeStatus(detail.project.status),
    notas: detail.project.notas ?? "",
    precio_final_manual: detail.project.precio_final_manual ?? null,
    materials: detail.materials
      .filter((line) => Boolean(line.material_id))
      .map((line) => ({
        material_id: line.material_id || "",
        consumo: Number(line.consumo ?? 0),
        desperdicio_pct: Number(line.desperdicio_pct ?? 0),
        costo_unitario: Number(line.costo_unitario_snapshot ?? 0),
      })),
    labor: mappedLabor.length > 0 ? mappedLabor : buildDefaultProjectLaborLines(defaultCostHour),
  };
}

export async function listProjectsRecords(filters: Partial<ProjectsQueryInput> = {}) {
  return projectsService.list({
    search: filters.search,
    status: filters.status,
    client_id: filters.client_id,
    include_deleted: filters.include_deleted ?? false,
  });
}

export async function getProjectDetailRecord(projectId: string) {
  return projectsService.getDetail(projectId);
}

export async function createProjectBundleRecord(input: ProjectBundleFormInput) {
  return projectsService.saveBundle(mapProjectBundlePayload(input, { projectId: undefined }));
}

export async function updateProjectBundleRecord(projectId: string, input: ProjectBundleFormInput) {
  return projectsService.saveBundle(mapProjectBundlePayload(input, { projectId }));
}

export async function duplicateProjectRecord(projectId: string) {
  return projectsService.duplicate(projectId);
}

export async function archiveProjectRecord(projectId: string) {
  await projectsService.softDelete(projectId);
}

export async function restoreProjectRecord(projectId: string) {
  await projectsService.restore(projectId);
}

export async function listProjectClientsOptions(): Promise<ProjectClientOption[]> {
  const clients = await clientsService.list({
    include_deleted: false,
  });

  return clients
    .map((client) => ({
      id: client.id,
      nombre: client.nombre,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export async function listProjectMaterialsOptions(): Promise<ProjectMaterialOption[]> {
  const materials = await materialsService.list({
    include_deleted: false,
    estado: "active",
  });

  return materials
    .map((material) => ({
      id: material.id,
      codigo: material.codigo,
      nombre: material.nombre,
      unidad: material.unidad,
      costo_unitario: Number(material.costo_unitario || 0),
      espesor_mm: material.espesor_mm ?? null,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export async function getProjectCostingSettingsInput() {
  const settings = await settingsService.getCurrent();
  return {
    settings,
    costing: mapSettingsToCostingInput(settings),
  };
}
