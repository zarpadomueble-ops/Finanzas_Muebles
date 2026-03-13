import type { CostingGlobalSettingsInput } from "@/domain/costing";
import { materialsService } from "@/services/materials";
import {
  ECOMMERCE_CHANNEL_LABELS,
  ECOMMERCE_CHANNEL_OPTIONS,
  ECOMMERCE_PROCESS_LABELS,
  ECOMMERCE_PROCESS_OPTIONS,
  ECOMMERCE_STATUS_OPTIONS,
  ecommerceService,
  type EcommerceProductBundleMutationInput,
  type EcommerceProductDetailRecord,
  type EcommerceProcessKey,
} from "@/services/ecommerce";
import { settingsService } from "@/services/settings";
import type {
  EcommerceChannelSimulationInput,
  EcommerceProductBundleFormInput,
  EcommerceProcessLineInput,
  EcommerceQueryInput,
} from "../schemas";
import type { EcommerceMaterialOption } from "../types";

function normalizeString(value: string | null | undefined) {
  return value?.trim() || "";
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

function normalizeProcessKey(value: string): EcommerceProcessKey {
  const normalized = value.trim().toLowerCase();
  return ECOMMERCE_PROCESS_OPTIONS.includes(normalized as EcommerceProcessKey)
    ? (normalized as EcommerceProcessKey)
    : "armado";
}

function normalizeStatus(value: string): EcommerceProductBundleFormInput["estado"] {
  const normalized = value.trim().toLowerCase();
  return ECOMMERCE_STATUS_OPTIONS.includes(normalized as EcommerceProductBundleFormInput["estado"])
    ? (normalized as EcommerceProductBundleFormInput["estado"])
    : "draft";
}

function mapBundlePayload(
  input: EcommerceProductBundleFormInput,
  params: { productId?: string } = {},
): EcommerceProductBundleMutationInput {
  return {
    product: {
      id: params.productId ?? input.id,
      sku: input.sku.trim(),
      nombre: input.nombre.trim(),
      categoria: normalizeString(input.categoria),
      precio_mercado: normalizeNullableNumber(input.precio_mercado),
      ancho_mm: normalizeNullableNumber(input.ancho_mm),
      alto_mm: normalizeNullableNumber(input.alto_mm),
      profundidad_mm: normalizeNullableNumber(input.profundidad_mm),
      unidades_lote: Math.max(1, Math.floor(normalizeNumber(input.unidades_lote))),
      estado: input.estado,
      embalaje_unitario: Math.max(0, normalizeNumber(input.embalaje_unitario)),
      envio_unitario: Math.max(0, normalizeNumber(input.envio_unitario)),
    },
    materials: input.materials.map((line) => ({
      material_id: line.material_id.trim(),
      consumo_unit: Math.max(0, normalizeNumber(line.consumo_unit)),
      costo_unitario: Math.max(0, normalizeNumber(line.costo_unitario)),
    })),
    processes: input.processes.map((line) => {
      const processKey = normalizeProcessKey(line.proceso_key);
      return {
        proceso_key: processKey,
        proceso_nombre: normalizeString(line.proceso_nombre) || ECOMMERCE_PROCESS_LABELS[processKey],
        horas_unit: Math.max(0, normalizeNumber(line.horas_unit)),
        costo_hora: normalizeNullableNumber(line.costo_hora),
      };
    }),
  };
}

function mapSettingsToCostingInput(
  settings: Awaited<ReturnType<typeof settingsService.getCurrent>>,
): CostingGlobalSettingsInput {
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

export function buildDefaultEcommerceProcessLines(
  defaultCostHour: number | null = null,
): EcommerceProcessLineInput[] {
  return ECOMMERCE_PROCESS_OPTIONS.map((processKey) => ({
    proceso_key: processKey,
    proceso_nombre: ECOMMERCE_PROCESS_LABELS[processKey],
    horas_unit: 0,
    costo_hora: defaultCostHour,
  }));
}

export function createEmptyEcommerceFormInput(
  params: { defaultCostHour?: number | null } = {},
): EcommerceProductBundleFormInput {
  return {
    sku: "",
    nombre: "",
    categoria: "",
    precio_mercado: null,
    ancho_mm: null,
    alto_mm: null,
    profundidad_mm: null,
    unidades_lote: 1,
    estado: "draft",
    embalaje_unitario: 0,
    envio_unitario: 0,
    materials: [],
    processes: buildDefaultEcommerceProcessLines(params.defaultCostHour ?? null),
  };
}

export function mapEcommerceDetailToFormInput(
  detail: EcommerceProductDetailRecord,
  defaultCostHour: number | null = null,
): EcommerceProductBundleFormInput {
  const mappedProcesses = detail.processes.map((line) => {
    const processKey = normalizeProcessKey(line.proceso_key);
    return {
      proceso_key: processKey,
      proceso_nombre: line.proceso_nombre || ECOMMERCE_PROCESS_LABELS[processKey],
      horas_unit: Number(line.horas_unit ?? 0),
      costo_hora: line.costo_hora_snapshot ?? defaultCostHour,
    } satisfies EcommerceProcessLineInput;
  });

  return {
    id: detail.product.id,
    sku: detail.product.sku,
    nombre: detail.product.nombre,
    categoria: detail.product.categoria ?? "",
    precio_mercado: detail.product.precio_mercado > 0 ? detail.product.precio_mercado : null,
    ancho_mm: detail.product.ancho ?? null,
    alto_mm: detail.product.alto ?? null,
    profundidad_mm: detail.product.profundidad ?? null,
    unidades_lote: Number(detail.product.unidades_lote || 1),
    estado: normalizeStatus(detail.product.status),
    embalaje_unitario: Number(detail.product.embalaje_unitario || 0),
    envio_unitario: Number(detail.product.envio_unitario || 0),
    materials: detail.materials
      .filter((line) => Boolean(line.material_id))
      .map((line) => ({
        material_id: line.material_id || "",
        consumo_unit: Number(line.consumo_unit || 0),
        costo_unitario: Number(line.costo_unitario_snapshot || 0),
      })),
    processes:
      mappedProcesses.length > 0 ? mappedProcesses : buildDefaultEcommerceProcessLines(defaultCostHour),
  };
}

export function buildDefaultChannelSimulator(
  settings: CostingGlobalSettingsInput,
  marketPrice: number | null,
): EcommerceChannelSimulationInput[] {
  return [
    {
      channel: "venta_directa",
      comision_pct: 0,
      publicidad_pct: 0,
      impuestos_pct: settings.impuestosPct,
      precio_venta: marketPrice,
    },
    {
      channel: "marketplace",
      comision_pct: Math.max(settings.comisionCobroPct, 16),
      publicidad_pct: settings.publicidadPct,
      impuestos_pct: settings.impuestosPct,
      precio_venta: marketPrice,
    },
    {
      channel: "tienda_propia",
      comision_pct: settings.comisionCobroPct,
      publicidad_pct: settings.publicidadPct,
      impuestos_pct: settings.impuestosPct,
      precio_venta: marketPrice,
    },
  ];
}

export function getChannelLabel(channel: EcommerceChannelSimulationInput["channel"]) {
  return ECOMMERCE_CHANNEL_LABELS[channel];
}

export async function listEcommerceRecords(filters: Partial<EcommerceQueryInput> = {}) {
  return ecommerceService.list({
    search: filters.search,
    status: filters.status,
    include_deleted: filters.include_deleted ?? false,
  });
}

export async function getEcommerceDetailRecord(productId: string) {
  return ecommerceService.getDetail(productId);
}

export async function createEcommerceBundleRecord(input: EcommerceProductBundleFormInput) {
  return ecommerceService.saveBundle(mapBundlePayload(input, { productId: undefined }));
}

export async function updateEcommerceBundleRecord(
  productId: string,
  input: EcommerceProductBundleFormInput,
) {
  return ecommerceService.saveBundle(mapBundlePayload(input, { productId }));
}

export async function duplicateEcommerceRecord(productId: string) {
  return ecommerceService.duplicate(productId);
}

export async function archiveEcommerceRecord(productId: string) {
  await ecommerceService.softDelete(productId);
}

export async function restoreEcommerceRecord(productId: string) {
  await ecommerceService.restore(productId);
}

export async function listEcommerceMaterialOptions(): Promise<EcommerceMaterialOption[]> {
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

export async function getEcommerceCostingSettingsInput() {
  const settings = await settingsService.getCurrent();
  return {
    settings,
    costing: mapSettingsToCostingInput(settings),
  };
}

export { ECOMMERCE_CHANNEL_OPTIONS };
