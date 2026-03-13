import { createId } from "@/lib/utils";
import { materialsService } from "@/services/materials";
import {
  cuttingService,
  CUT_JOB_STATUS_OPTIONS,
  type CuttingBundleMutationInput,
  type CuttingJobDraftInput,
  type CuttingPartDraftInput,
} from "@/services/cutting";
import { settingsService } from "@/services/settings";
import type {
  CuttingBundleFormInput,
  CuttingJobInput,
  CuttingPartLineInput,
  CuttingQueryInput,
} from "../schemas";
import type { CuttingMaterialOption } from "../types";

type CuttingStatusOption = (typeof CUT_JOB_STATUS_OPTIONS)[number];

function normalizeStatus(value: string | undefined): CuttingStatusOption {
  if (!value) {
    return "draft";
  }

  const normalized = value.trim().toLowerCase();
  return CUT_JOB_STATUS_OPTIONS.includes(normalized as CuttingStatusOption)
    ? (normalized as CuttingStatusOption)
    : "draft";
}

function normalizeJobPayload(job: CuttingJobInput, params: { jobId?: string } = {}): CuttingJobDraftInput {
  return {
    id: params.jobId ?? job.id,
    nombre: job.nombre.trim(),
    largo_placa_mm: Math.max(0, Number(job.largo_placa_mm || 0)),
    ancho_placa_mm: Math.max(0, Number(job.ancho_placa_mm || 0)),
    kerf_mm: Math.max(0, Number(job.kerf_mm || 0)),
    margen_perimetral_mm: Math.max(0, Number(job.margen_perimetral_mm || 0)),
    desperdicio_extra_pct: Math.max(0, Number(job.desperdicio_extra_pct || 0)),
    permitir_rotacion_default: Boolean(job.permitir_rotacion_default),
    veta_default: Boolean(job.veta_default),
    status: normalizeStatus(job.status),
  };
}

function normalizePartPayload(part: CuttingPartLineInput): CuttingPartDraftInput {
  return {
    id: part.id,
    pieza: part.pieza.trim(),
    cantidad: Math.max(1, Math.floor(Number(part.cantidad || 1))),
    largo_mm: Math.max(0, Number(part.largo_mm || 0)),
    ancho_mm: Math.max(0, Number(part.ancho_mm || 0)),
    material_id: part.material_id.trim(),
    espesor_mm: part.espesor_mm === null ? null : Math.max(0, Number(part.espesor_mm || 0)),
    rotacion_permitida: Boolean(part.rotacion_permitida),
    veta_obligatoria: Boolean(part.veta_obligatoria),
    canto: part.canto.trim(),
    prioridad: Math.min(9, Math.max(1, Math.floor(Number(part.prioridad || 3)))),
    observacion: part.observacion.trim(),
    bloqueada: Boolean(part.bloqueada),
  };
}

function mapBundlePayload(
  input: CuttingBundleFormInput,
  params: { jobId?: string } = {},
): CuttingBundleMutationInput {
  return {
    job: normalizeJobPayload(input.job, params),
    parts: input.parts.map(normalizePartPayload),
  };
}

export function createEmptyCuttingPartInput(
  params: {
    materialId?: string;
    espesorMm?: number | null;
    allowRotation?: boolean;
    grainRequired?: boolean;
  } = {},
): CuttingPartLineInput {
  return {
    id: createId(),
    pieza: "Pieza nueva",
    cantidad: 1,
    largo_mm: 500,
    ancho_mm: 300,
    material_id: params.materialId ?? "",
    espesor_mm: params.espesorMm ?? null,
    rotacion_permitida: params.allowRotation ?? true,
    veta_obligatoria: params.grainRequired ?? false,
    canto: "",
    prioridad: 3,
    observacion: "",
    bloqueada: false,
  };
}

export function createEmptyCuttingBundleInput(
  params: {
    kerfMm?: number;
    margenPerimetralMm?: number;
    desperdicioExtraPct?: number;
    permitirRotacionDefault?: boolean;
    vetaDefault?: boolean;
    materialId?: string;
    espesorMm?: number | null;
  } = {},
): CuttingBundleFormInput {
  return {
    job: {
      nombre: "Nuevo trabajo de corte",
      largo_placa_mm: 2750,
      ancho_placa_mm: 1830,
      kerf_mm: params.kerfMm ?? 3,
      margen_perimetral_mm: params.margenPerimetralMm ?? 10,
      desperdicio_extra_pct: params.desperdicioExtraPct ?? 0,
      permitir_rotacion_default: params.permitirRotacionDefault ?? true,
      veta_default: params.vetaDefault ?? false,
      status: "draft",
    },
    parts: [
      createEmptyCuttingPartInput({
        materialId: params.materialId,
        espesorMm: params.espesorMm ?? null,
        allowRotation: params.permitirRotacionDefault ?? true,
        grainRequired: params.vetaDefault ?? false,
      }),
    ],
  };
}

export function mapCuttingDetailToFormInput(
  detail: Awaited<ReturnType<typeof cuttingService.getDetail>>,
): CuttingBundleFormInput {
  if (!detail) {
    return createEmptyCuttingBundleInput();
  }

  return {
    job: {
      id: detail.job.id,
      nombre: detail.job.nombre,
      largo_placa_mm: Number(detail.job.largo_placa_mm || 0),
      ancho_placa_mm: Number(detail.job.ancho_placa_mm || 0),
      kerf_mm: Number(detail.job.kerf_mm || 0),
      margen_perimetral_mm: Number(detail.job.margen_perimetral_mm || 0),
      desperdicio_extra_pct: Number(detail.job.desperdicio_extra_pct || 0),
      permitir_rotacion_default: Boolean(detail.job.allow_rotation_default),
      veta_default: Boolean(detail.job.grain_required_default),
      status: normalizeStatus(detail.job.status),
    },
    parts: detail.parts.map((part) => ({
      id: part.id,
      pieza: part.pieza,
      cantidad: Number(part.cantidad || 0),
      largo_mm: Number(part.largo_mm || 0),
      ancho_mm: Number(part.ancho_mm || 0),
      material_id: part.material_id || "",
      espesor_mm: part.espesor_mm,
      rotacion_permitida: Boolean(part.rotacion_permitida),
      veta_obligatoria: Boolean(part.veta_obligatoria),
      canto: part.canto || "",
      prioridad: Number(part.prioridad || 3),
      observacion: part.observacion || "",
      bloqueada: Boolean(part.bloqueada),
    })),
  };
}

export async function listCuttingRecords(filters: Partial<CuttingQueryInput> = {}) {
  return cuttingService.list({
    search: filters.search,
    status: filters.status,
    include_deleted: filters.include_deleted ?? false,
  });
}

export async function getCuttingDetailRecord(jobId: string) {
  return cuttingService.getDetail(jobId);
}

export async function createCuttingBundleRecord(input: CuttingBundleFormInput) {
  return cuttingService.saveBundle(mapBundlePayload(input, { jobId: undefined }));
}

export async function updateCuttingBundleRecord(jobId: string, input: CuttingBundleFormInput) {
  return cuttingService.saveBundle(mapBundlePayload(input, { jobId }));
}

export async function optimizeCuttingBundleRecord(
  input: CuttingBundleFormInput,
  params: {
    jobId?: string;
    iteration?: number;
  } = {},
) {
  return cuttingService.optimizeBundle({
    ...mapBundlePayload(input, { jobId: params.jobId }),
    iteration: params.iteration,
  });
}

export async function duplicateCuttingRecord(jobId: string) {
  return cuttingService.duplicate(jobId);
}

export async function archiveCuttingRecord(jobId: string) {
  await cuttingService.softDelete(jobId);
}

export async function restoreCuttingRecord(jobId: string) {
  await cuttingService.restore(jobId);
}

export async function getCuttingDefaults() {
  const settings = await settingsService.getCurrent();
  return {
    kerfMm: settings.kerf_sierra_mm,
    margenPerimetralMm: settings.margen_perimetral_placa_mm,
    desperdicioExtraPct: settings.desperdicio_melamina_pct,
    permitirRotacionDefault: settings.permitir_rotacion_por_defecto,
    vetaDefault: settings.veta_obligatoria_por_defecto,
  };
}

export async function listCuttingMaterialOptions(): Promise<CuttingMaterialOption[]> {
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
      area_m2: material.area_m2 ?? null,
      largo_mm: material.largo_mm ?? null,
      ancho_mm: material.ancho_mm ?? null,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}
