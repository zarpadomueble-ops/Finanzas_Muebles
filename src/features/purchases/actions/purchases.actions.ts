import { buildPurchaseOrderCsv, type PurchaseSourceType } from "@/domain/purchases";
import { PURCHASE_SOURCE_LABELS } from "@/services/purchases";
import { suppliersService } from "@/services/suppliers";
import { projectsService } from "@/services/projects";
import { ecommerceService } from "@/services/ecommerce";
import { cuttingService } from "@/services/cutting";
import { purchasesService } from "@/services/purchases";
import type {
  PurchaseDraftFormInput,
  PurchaseDraftItemInput,
  PurchaseHeaderEditInput,
  PurchasesQueryInput,
  PurchaseSourceBuilderInput,
} from "../schemas";
import type { PurchaseSourceOption, PurchaseSupplierOption } from "../types";

function normalizeString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeDateValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.includes("T") ? value.slice(0, 10) : value;
}

function normalizeFactor(value: number | null | undefined, fallback = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  const normalized = Math.max(1, Math.floor(value));
  return normalized || fallback;
}

function mapDraftItemPayload(item: PurchaseDraftItemInput) {
  return {
    line_id: item.line_id,
    material_id: normalizeString(item.material_id),
    supplier_id: normalizeString(item.supplier_id),
    supplier_name: normalizeString(item.supplier_name),
    descripcion_snapshot: item.descripcion_snapshot.trim(),
    cantidad: Number(item.cantidad || 0),
    unidad_snapshot: item.unidad_snapshot.trim(),
    costo_unitario_snapshot: Number(item.costo_unitario_snapshot || 0),
    source_line_id: normalizeString(item.source_line_id),
    source_line_label: normalizeString(item.source_line_label),
  };
}

export function createEmptyPurchaseDraftInput(
  params: {
    sourceType?: PurchaseSourceType;
    sourceId?: string;
    factor?: number;
  } = {},
): PurchaseDraftFormInput {
  return {
    source_type: params.sourceType ?? "custom_project",
    source_id: params.sourceId ?? "",
    source_label: "",
    factor: normalizeFactor(params.factor, 1),
    fecha_emision: new Date().toISOString().slice(0, 10),
    fecha_entrega_estimada: "",
    moneda: "ARS",
    notas: "",
    items: [],
  };
}

export function applyDraftSourceRecordToForm(
  input: PurchaseDraftFormInput,
  draft: Awaited<ReturnType<typeof purchasesService.buildDraftFromSource>>,
): PurchaseDraftFormInput {
  return {
    ...input,
    source_type: draft.source_type,
    source_id: draft.source_id,
    source_label: draft.source_label,
    factor: draft.factor,
    notas: input.notas.trim() || draft.suggested_notes,
    items: draft.items.map((item) => ({
      line_id: item.lineId,
      material_id: item.materialId,
      supplier_id: item.supplierId,
      supplier_name: item.supplierName,
      descripcion_snapshot: item.description,
      cantidad: item.quantity,
      unidad_snapshot: item.unit,
      costo_unitario_snapshot: item.unitCost,
      source_line_id: item.sourceLineId,
      source_line_label: item.sourceLineLabel,
    })),
  };
}

export async function listPurchaseRecords(filters: Partial<PurchasesQueryInput> = {}) {
  return purchasesService.list({
    search: filters.search,
    status: filters.status,
    supplier_id: filters.supplier_id,
    source_type: (filters.source_type as PurchaseSourceType | "") ?? "",
    include_deleted: filters.include_deleted ?? false,
  });
}

export async function getPurchaseDetailRecord(purchaseId: string) {
  return purchasesService.getDetail(purchaseId);
}

export async function preparePurchaseDraftFromSource(input: PurchaseSourceBuilderInput) {
  return purchasesService.buildDraftFromSource({
    source_type: input.source_type,
    source_id: input.source_id,
    factor: normalizeFactor(input.factor, 1),
  });
}

export async function createPurchasesFromDraftRecord(input: PurchaseDraftFormInput) {
  return purchasesService.createFromDraft({
    source_type: input.source_type,
    source_id: input.source_id,
    source_label: input.source_label,
    fecha_emision: input.fecha_emision,
    fecha_entrega_estimada: normalizeString(input.fecha_entrega_estimada),
    moneda: input.moneda.trim(),
    notas: input.notas.trim(),
    items: input.items.map(mapDraftItemPayload),
  });
}

export async function updatePurchaseItemReceivedRecord(
  purchaseId: string,
  itemId: string,
  cantidadRecibida: number,
) {
  return purchasesService.updateItemReceipt(purchaseId, itemId, {
    cantidad_recibida: Number(cantidadRecibida || 0),
  });
}

export async function updatePurchaseHeaderRecord(
  purchaseId: string,
  input: PurchaseHeaderEditInput,
) {
  return purchasesService.updateHeader(purchaseId, {
    fecha_entrega_estimada:
      input.fecha_entrega_estimada === undefined ? undefined : normalizeString(input.fecha_entrega_estimada),
    notas: input.notas === undefined ? undefined : input.notas.trim(),
  });
}

export async function listPurchaseSuppliersOptions(): Promise<PurchaseSupplierOption[]> {
  const suppliers = await suppliersService.list();

  return suppliers
    .filter((supplier) => !supplier.deleted_at)
    .map((supplier) => ({
      id: supplier.id,
      nombre: supplier.nombre,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export async function listPurchaseSourceOptions(): Promise<PurchaseSourceOption[]> {
  const [projects, products, cutJobs] = await Promise.all([
    projectsService.list({ include_deleted: false }),
    ecommerceService.list({ include_deleted: false }),
    cuttingService.list({ include_deleted: false }),
  ]);

  const projectOptions: PurchaseSourceOption[] = projects.map((project) => ({
    type: "custom_project",
    id: project.id,
    label: project.nombre_proyecto,
    description: `${project.client?.nombre || "Sin cliente"} | ${project.status}`,
    default_factor: 1,
  }));

  const ecommerceOptions: PurchaseSourceOption[] = products.map((product) => ({
    type: "ecommerce_product",
    id: product.id,
    label: `${product.sku} - ${product.nombre}`,
    description: `${product.categoria || "Sin categoria"} | lote ${product.unidades_lote}`,
    default_factor: Math.max(1, Number(product.unidades_lote || 1)),
  }));

  const cuttingOptions: PurchaseSourceOption[] = cutJobs.map((job) => ({
    type: "cut_job",
    id: job.id,
    label: job.nombre,
    description: `${job.status} | ${job.placas_necesarias_snapshot} placas`,
    default_factor: 1,
  }));

  return [...projectOptions, ...ecommerceOptions, ...cuttingOptions];
}

export function getPurchaseSourceLabel(sourceType: PurchaseSourceType) {
  return PURCHASE_SOURCE_LABELS[sourceType];
}

export function buildPurchaseExportCsv(params: {
  purchaseId: string;
  supplierName: string | null;
  sourceLabel: string;
  status: string;
  issueDate: string;
  expectedDate: string | null;
  currency: string;
  notes: string | null;
  items: Array<{
    description: string;
    quantity: number;
    unit: string;
    unitCost: number;
    subtotal: number;
  }>;
}) {
  return buildPurchaseOrderCsv(
    {
      id: params.purchaseId,
      supplierName: params.supplierName,
      sourceLabel: params.sourceLabel,
      status: params.status,
      issueDate: normalizeDateValue(params.issueDate),
      expectedDate: normalizeDateValue(params.expectedDate),
      currency: params.currency,
      notes: params.notes,
    },
    params.items,
  );
}
