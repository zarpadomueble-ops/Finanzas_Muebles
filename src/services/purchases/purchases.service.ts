import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  buildPurchaseDraft,
  resolvePurchaseItemStatus,
  resolvePurchaseStatus,
  type PurchaseDraftItemInput,
  type PurchaseDraftResult,
  type PurchaseSourceType,
  type PurchaseStatusValue,
} from "@/domain/purchases";
import { cuttingService } from "@/services/cutting";
import { ecommerceService } from "@/services/ecommerce";
import { projectsService } from "@/services/projects";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/services/supabase/browser-client";
import type { Database, TableInsert, TableRow, TableUpdate } from "@/types";

const PURCHASES_TABLE = "purchases" as const;
const PURCHASE_ITEMS_TABLE = "purchase_items" as const;
const MATERIALS_TABLE = "materials" as const;

const PURCHASES_SELECT = "*, supplier:suppliers(id, nombre)";
const PURCHASE_ITEMS_SELECT =
  "*, material:materials(id, codigo, nombre, unidad, supplier_id), supplier:suppliers(id, nombre)";
const MATERIALS_LOOKUP_SELECT =
  "id, codigo, nombre, unidad, costo_unitario, supplier_id, largo_mm, ancho_mm, espesor_mm, supplier:suppliers(id, nombre)";

type QueryResponse<T> = {
  data: T | null;
  error: PostgrestError | null;
};

type MutationResponse = {
  error: PostgrestError | null;
};

type PurchaseRow = TableRow<typeof PURCHASES_TABLE>;
type PurchaseInsert = TableInsert<typeof PURCHASES_TABLE>;
type PurchaseUpdate = TableUpdate<typeof PURCHASES_TABLE>;
type PurchaseItemRow = TableRow<typeof PURCHASE_ITEMS_TABLE>;
type PurchaseItemInsert = TableInsert<typeof PURCHASE_ITEMS_TABLE>;
type PurchaseItemUpdate = TableUpdate<typeof PURCHASE_ITEMS_TABLE>;
type MaterialRow = TableRow<typeof MATERIALS_TABLE>;

interface AuthorizedContext {
  client: SupabaseClient<Database>;
  userId: string;
}

interface PurchaseRowWithSupplier extends PurchaseRow {
  supplier: PurchaseSupplierPreview | null;
}

interface MaterialLookupRow
  extends Pick<
    MaterialRow,
    "id" | "codigo" | "nombre" | "unidad" | "costo_unitario" | "supplier_id" | "largo_mm" | "ancho_mm" | "espesor_mm"
  > {
  supplier: PurchaseSupplierPreview | null;
}

interface PurchaseItemRowWithRelations extends PurchaseItemRow {
  supplier: PurchaseSupplierPreview | null;
  material: Pick<MaterialRow, "id" | "codigo" | "nombre" | "unidad" | "supplier_id"> | null;
}

interface PurchaseItemStatsAccumulator {
  item_count: number;
  purchased_items_count: number;
  pending_items_count: number;
}

export const PURCHASE_STATUS_OPTIONS = ["pending", "partial", "purchased"] as const;
export const PURCHASE_SOURCE_LABELS: Record<PurchaseSourceType, string> = {
  custom_project: "Proyecto a medida",
  ecommerce_product: "Producto ecommerce",
  cut_job: "Trabajo de corte",
};

export const PURCHASE_STATUS_LABELS: Record<PurchaseStatusValue, string> = {
  pending: "Pendiente",
  partial: "Parcial",
  purchased: "Comprado",
};

export type PurchaseStatusOption = (typeof PURCHASE_STATUS_OPTIONS)[number];

export interface PurchaseSupplierPreview {
  id: string;
  nombre: string;
}

export interface PurchaseRecord extends PurchaseRowWithSupplier {
  status: PurchaseStatusValue;
  item_count: number;
  purchased_items_count: number;
  pending_items_count: number;
}

export interface PurchaseItemRecord extends PurchaseItemRowWithRelations {
  estado: PurchaseStatusValue;
}

export interface PurchaseDetailSummary {
  item_count: number;
  purchased_items_count: number;
  pending_items_count: number;
  total_quantity: number;
  subtotal: number;
  status: PurchaseStatusValue;
}

export interface PurchaseDetailRecord {
  purchase: PurchaseRecord;
  items: PurchaseItemRecord[];
  summary: PurchaseDetailSummary;
}

export interface PurchasesListFilters {
  search?: string;
  status?: string;
  supplier_id?: string;
  source_type?: PurchaseSourceType | "";
  include_deleted?: boolean;
}

export interface PurchaseDraftSourceBuildInput {
  source_type: PurchaseSourceType;
  source_id: string;
  factor?: number;
}

export interface PurchaseDraftSourceRecord extends PurchaseDraftResult {
  source_type: PurchaseSourceType;
  source_id: string;
  source_label: string;
  factor: number;
  suggested_notes: string;
}

export interface PurchaseDraftMutationItemInput {
  line_id?: string;
  material_id: string | null;
  supplier_id: string | null;
  supplier_name?: string | null;
  descripcion_snapshot: string;
  cantidad: number;
  unidad_snapshot: string;
  costo_unitario_snapshot: number;
  source_line_id?: string | null;
  source_line_label?: string | null;
}

export interface CreatePurchasesFromDraftInput {
  source_type: PurchaseSourceType;
  source_id: string;
  source_label: string;
  fecha_emision: string;
  fecha_entrega_estimada?: string | null;
  moneda: string;
  notas: string;
  items: PurchaseDraftMutationItemInput[];
}

export interface PurchaseItemReceiptUpdateInput {
  cantidad_recibida: number;
}

export interface PurchaseHeaderUpdateInput {
  fecha_entrega_estimada?: string | null;
  notas?: string;
}

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

function normalizeNonNegative(value: number | null | undefined) {
  return Math.max(0, normalizeNumber(value));
}

function normalizePositiveInt(value: number | null | undefined, fallback = 1) {
  const normalized = Math.floor(normalizeNonNegative(value));
  return normalized > 0 ? normalized : fallback;
}

function normalizeDate(value: string | null | undefined) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return new Date().toISOString().slice(0, 10);
  }

  return normalized.includes("T") ? normalized.slice(0, 10) : normalized;
}

function normalizeStatus(value: string | null | undefined): PurchaseStatusValue {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "partial") {
    return "partial";
  }

  if (normalized === "purchased") {
    return "purchased";
  }

  return "pending";
}

function matchesSearch(record: PurchaseRowWithSupplier, search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const haystack = [
    record.id,
    record.source_type,
    record.moneda,
    record.status,
    record.notas ?? "",
    record.supplier?.nombre ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(needle);
}

function mapItemStatus(row: Pick<PurchaseItemRow, "cantidad" | "cantidad_recibida" | "estado">) {
  return row.estado ? normalizeStatus(row.estado) : resolvePurchaseItemStatus({
    quantity: normalizeNonNegative(row.cantidad),
    receivedQuantity: normalizeNonNegative(row.cantidad_recibida),
  });
}

function buildDetailSummary(items: PurchaseItemRecord[]): PurchaseDetailSummary {
  const purchasedItemsCount = items.filter((item) => mapItemStatus(item) === "purchased").length;
  const pendingItemsCount = items.filter((item) => mapItemStatus(item) !== "purchased").length;

  return {
    item_count: items.length,
    purchased_items_count: purchasedItemsCount,
    pending_items_count: pendingItemsCount,
    total_quantity: items.reduce((total, item) => total + normalizeNonNegative(item.cantidad), 0),
    subtotal: items.reduce((total, item) => total + normalizeNonNegative(item.subtotal_snapshot), 0),
    status: resolvePurchaseStatus(
      items.map((item) => ({
        quantity: normalizeNonNegative(item.cantidad),
        receivedQuantity: normalizeNonNegative(item.cantidad_recibida),
      })),
    ),
  };
}

function mapPurchaseRecord(
  row: PurchaseRowWithSupplier,
  stats: PurchaseItemStatsAccumulator = {
    item_count: 0,
    purchased_items_count: 0,
    pending_items_count: 0,
  },
): PurchaseRecord {
  return {
    ...row,
    status: normalizeStatus(row.status),
    item_count: stats.item_count,
    purchased_items_count: stats.purchased_items_count,
    pending_items_count: stats.pending_items_count,
  };
}

function mapPurchaseItemRecord(row: PurchaseItemRowWithRelations): PurchaseItemRecord {
  return {
    ...row,
    estado: mapItemStatus(row),
  };
}

async function getAuthorizedContext(): Promise<AuthorizedContext> {
  if (!hasSupabaseConfig()) {
    throw new Error("Falta configurar Supabase en variables de entorno.");
  }

  const client = getSupabaseBrowserClient();
  if (!client) {
    throw new Error("No se pudo inicializar el cliente de Supabase.");
  }

  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    throw new Error("Sesion no valida. Inicia sesion nuevamente.");
  }

  return { client, userId: user.id };
}

async function getPurchaseByIdWithContext(
  context: AuthorizedContext,
  purchaseId: string,
  includeDeleted = true,
) {
  let query = context.client
    .from(PURCHASES_TABLE as never)
    .select(PURCHASES_SELECT)
    .eq("id", purchaseId)
    .eq("profile_id", context.userId);

  if (!includeDeleted) {
    query = query.is("deleted_at", null);
  }

  const response = (await query.maybeSingle()) as QueryResponse<PurchaseRowWithSupplier>;
  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data;
}

async function getPurchaseItemsWithContext(
  context: AuthorizedContext,
  purchaseId: string,
) {
  const response = (await context.client
    .from(PURCHASE_ITEMS_TABLE as never)
    .select(PURCHASE_ITEMS_SELECT)
    .eq("profile_id", context.userId)
    .eq("purchase_id", purchaseId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })) as QueryResponse<PurchaseItemRowWithRelations[]>;

  if (response.error) {
    throw new Error(response.error.message);
  }

  return (response.data ?? []).map(mapPurchaseItemRecord);
}

async function getPurchaseItemStatsWithContext(
  context: AuthorizedContext,
  purchaseIds: string[],
) {
  if (purchaseIds.length === 0) {
    return new Map<string, PurchaseItemStatsAccumulator>();
  }

  const response = (await context.client
    .from(PURCHASE_ITEMS_TABLE as never)
    .select("purchase_id, cantidad, cantidad_recibida, estado")
    .eq("profile_id", context.userId)
    .in("purchase_id", purchaseIds)
    .is("deleted_at", null)) as QueryResponse<
    Array<Pick<PurchaseItemRow, "purchase_id" | "cantidad" | "cantidad_recibida" | "estado">>
  >;

  if (response.error) {
    throw new Error(response.error.message);
  }

  const stats = new Map<string, PurchaseItemStatsAccumulator>();

  for (const row of response.data ?? []) {
    const current = stats.get(row.purchase_id) ?? {
      item_count: 0,
      purchased_items_count: 0,
      pending_items_count: 0,
    };

    const status = row.estado ? normalizeStatus(row.estado) : resolvePurchaseItemStatus({
      quantity: normalizeNonNegative(row.cantidad),
      receivedQuantity: normalizeNonNegative(row.cantidad_recibida),
    });

    current.item_count += 1;
    if (status === "purchased") {
      current.purchased_items_count += 1;
    } else {
      current.pending_items_count += 1;
    }

    stats.set(row.purchase_id, current);
  }

  return stats;
}

async function getMaterialsMapWithContext(
  context: AuthorizedContext,
  materialIds: string[],
) {
  if (materialIds.length === 0) {
    return new Map<string, MaterialLookupRow>();
  }

  const response = (await context.client
    .from(MATERIALS_TABLE as never)
    .select(MATERIALS_LOOKUP_SELECT)
    .eq("profile_id", context.userId)
    .in("id", materialIds)
    .is("deleted_at", null)) as QueryResponse<MaterialLookupRow[]>;

  if (response.error) {
    throw new Error(response.error.message);
  }

  return new Map((response.data ?? []).map((material) => [material.id, material]));
}

async function updatePurchaseStatusWithContext(
  context: AuthorizedContext,
  purchaseId: string,
  status: PurchaseStatusValue,
) {
  const response = (await context.client
    .from(PURCHASES_TABLE as never)
    .update(
      {
        status,
        updated_by: context.userId,
      } as never,
    )
    .eq("id", purchaseId)
    .eq("profile_id", context.userId)) as MutationResponse;

  if (response.error) {
    throw new Error(response.error.message);
  }
}

function mapDraftInputs(items: PurchaseDraftMutationItemInput[], sourceType: PurchaseSourceType, sourceId: string) {
  return items.map<PurchaseDraftItemInput>((item) => ({
    lineId: item.line_id,
    materialId: item.material_id,
    supplierId: item.supplier_id,
    supplierName: item.supplier_name ?? null,
    description: item.descripcion_snapshot,
    quantity: item.cantidad,
    unit: item.unidad_snapshot,
    unitCost: item.costo_unitario_snapshot,
    sourceType,
    sourceId,
    sourceLineId: item.source_line_id,
    sourceLineLabel: item.source_line_label,
  }));
}

function buildProjectLineDescription(code: string | null, name: string) {
  return [normalizeString(code), normalizeString(name)].filter(Boolean).join(" - ");
}

function buildBoardDescription(material: MaterialLookupRow | null, largoMm: number, anchoMm: number) {
  const code = material?.codigo ? `${material.codigo} - ` : "";
  const name = material?.nombre ?? "Placa";
  return `${code}${name} | ${Math.round(largoMm)} x ${Math.round(anchoMm)} mm`;
}

async function buildProjectDraftWithContext(
  context: AuthorizedContext,
  input: PurchaseDraftSourceBuildInput,
): Promise<PurchaseDraftSourceRecord> {
  const detail = await projectsService.getDetail(input.source_id);
  if (!detail) {
    throw new Error("No se encontro el proyecto seleccionado.");
  }

  const factor = normalizePositiveInt(input.factor, 1);
  const materialIds = Array.from(
    new Set(
      detail.materials
        .map((line) => line.material_id)
        .filter((materialId): materialId is string => Boolean(materialId)),
    ),
  );
  const materialMap = await getMaterialsMapWithContext(context, materialIds);

  const draft = buildPurchaseDraft(
    detail.materials.map((line) => {
      const material = line.material_id ? materialMap.get(line.material_id) ?? null : null;
      return {
        materialId: line.material_id,
        supplierId: material?.supplier_id ?? null,
        supplierName: material?.supplier?.nombre ?? null,
        description: buildProjectLineDescription(line.material_codigo_snapshot, line.material_nombre_snapshot),
        quantity: normalizeNonNegative(line.consumo) * factor,
        unit: line.unidad_snapshot ?? material?.unidad ?? "unidad",
        unitCost: normalizeNonNegative(line.costo_unitario_snapshot),
        sourceType: "custom_project",
        sourceId: detail.project.id,
        sourceLineId: line.id,
        sourceLineLabel: detail.project.nombre_proyecto,
      } satisfies PurchaseDraftItemInput;
    }),
  );

  return {
    ...draft,
    source_type: "custom_project",
    source_id: detail.project.id,
    source_label: detail.project.nombre_proyecto,
    factor,
    suggested_notes: `Compra generada desde el proyecto ${detail.project.nombre_proyecto}.`,
  };
}

async function buildEcommerceDraftWithContext(
  context: AuthorizedContext,
  input: PurchaseDraftSourceBuildInput,
): Promise<PurchaseDraftSourceRecord> {
  const detail = await ecommerceService.getDetail(input.source_id);
  if (!detail) {
    throw new Error("No se encontro el producto ecommerce seleccionado.");
  }

  const factor = normalizePositiveInt(input.factor, normalizePositiveInt(detail.product.unidades_lote, 1));
  const materialIds = Array.from(
    new Set(
      detail.materials
        .map((line) => line.material_id)
        .filter((materialId): materialId is string => Boolean(materialId)),
    ),
  );
  const materialMap = await getMaterialsMapWithContext(context, materialIds);
  const sourceLabel = `${detail.product.sku} - ${detail.product.nombre}`;

  const draft = buildPurchaseDraft(
    detail.materials.map((line) => {
      const material = line.material_id ? materialMap.get(line.material_id) ?? null : null;
      return {
        materialId: line.material_id,
        supplierId: material?.supplier_id ?? null,
        supplierName: material?.supplier?.nombre ?? null,
        description: buildProjectLineDescription(line.material_codigo_snapshot, line.material_nombre_snapshot),
        quantity: normalizeNonNegative(line.consumo_unit) * factor,
        unit: line.unidad_snapshot ?? material?.unidad ?? "unidad",
        unitCost: normalizeNonNegative(line.costo_unitario_snapshot),
        sourceType: "ecommerce_product",
        sourceId: detail.product.id,
        sourceLineId: line.id,
        sourceLineLabel: sourceLabel,
      } satisfies PurchaseDraftItemInput;
    }),
  );

  return {
    ...draft,
    source_type: "ecommerce_product",
    source_id: detail.product.id,
    source_label: sourceLabel,
    factor,
    suggested_notes: `Compra generada desde ${sourceLabel} para ${factor} unidades.`,
  };
}

async function buildCuttingDraftWithContext(
  context: AuthorizedContext,
  input: PurchaseDraftSourceBuildInput,
): Promise<PurchaseDraftSourceRecord> {
  const detail = await cuttingService.getDetail(input.source_id);
  if (!detail) {
    throw new Error("No se encontro el trabajo de corte seleccionado.");
  }

  if (!detail.result || detail.result.boards.length === 0) {
    throw new Error("Optimiza el trabajo de corte antes de generar compras.");
  }

  const factor = normalizePositiveInt(input.factor, 1);
  const materialIds = Array.from(
    new Set(
      detail.result.boards
        .map((board) => board.materialId)
        .filter((materialId): materialId is string => Boolean(materialId)),
    ),
  );
  const materialMap = await getMaterialsMapWithContext(context, materialIds);

  const draft = buildPurchaseDraft(
    detail.result.boards.map((board) => {
      const material = board.materialId ? materialMap.get(board.materialId) ?? null : null;
      return {
        materialId: board.materialId || null,
        supplierId: material?.supplier_id ?? null,
        supplierName: material?.supplier?.nombre ?? null,
        description: buildBoardDescription(material, board.largoPlacaMm, board.anchoPlacaMm),
        quantity: factor,
        unit: material?.unidad ?? "unidad",
        unitCost: normalizeNonNegative(board.costoPlaca),
        sourceType: "cut_job",
        sourceId: detail.job.id,
        sourceLineId: board.boardKey,
        sourceLineLabel: board.boardLabel,
      } satisfies PurchaseDraftItemInput;
    }),
  );

  return {
    ...draft,
    source_type: "cut_job",
    source_id: detail.job.id,
    source_label: detail.job.nombre,
    factor,
    suggested_notes: `Compra generada desde el trabajo de corte ${detail.job.nombre}.`,
  };
}

async function getPurchaseDetailWithContext(
  context: AuthorizedContext,
  purchaseId: string,
): Promise<PurchaseDetailRecord | null> {
  const [purchaseRow, items] = await Promise.all([
    getPurchaseByIdWithContext(context, purchaseId, true),
    getPurchaseItemsWithContext(context, purchaseId),
  ]);

  if (!purchaseRow) {
    return null;
  }

  const summary = buildDetailSummary(items);
  return {
    purchase: mapPurchaseRecord(purchaseRow, {
      item_count: summary.item_count,
      purchased_items_count: summary.purchased_items_count,
      pending_items_count: summary.pending_items_count,
    }),
    items,
    summary,
  };
}

export const purchasesService = {
  async list(filters: PurchasesListFilters = {}): Promise<PurchaseRecord[]> {
    const context = await getAuthorizedContext();

    let query = context.client
      .from(PURCHASES_TABLE as never)
      .select(PURCHASES_SELECT)
      .eq("profile_id", context.userId);

    if (!filters.include_deleted) {
      query = query.is("deleted_at", null);
    }

    if (filters.status?.trim()) {
      query = query.eq("status", normalizeStatus(filters.status));
    }

    if (filters.supplier_id?.trim()) {
      query = query.eq("supplier_id", filters.supplier_id);
    }

    if (filters.source_type?.trim()) {
      query = query.eq("source_type", filters.source_type);
    }

    const response = (await query.order("updated_at", { ascending: false })) as QueryResponse<
      PurchaseRowWithSupplier[]
    >;

    if (response.error) {
      throw new Error(response.error.message);
    }

    const filteredRows = (response.data ?? []).filter((row) =>
      filters.search?.trim() ? matchesSearch(row, filters.search) : true,
    );
    const statsMap = await getPurchaseItemStatsWithContext(
      context,
      filteredRows.map((row) => row.id),
    );

    return filteredRows.map((row) => mapPurchaseRecord(row, statsMap.get(row.id)));
  },

  async getDetail(purchaseId: string): Promise<PurchaseDetailRecord | null> {
    const context = await getAuthorizedContext();
    return getPurchaseDetailWithContext(context, purchaseId);
  },

  async buildDraftFromSource(input: PurchaseDraftSourceBuildInput): Promise<PurchaseDraftSourceRecord> {
    const context = await getAuthorizedContext();

    if (input.source_type === "custom_project") {
      return buildProjectDraftWithContext(context, input);
    }

    if (input.source_type === "ecommerce_product") {
      return buildEcommerceDraftWithContext(context, input);
    }

    return buildCuttingDraftWithContext(context, input);
  },

  async createFromDraft(input: CreatePurchasesFromDraftInput): Promise<PurchaseDetailRecord[]> {
    const context = await getAuthorizedContext();
    const draft = buildPurchaseDraft(mapDraftInputs(input.items, input.source_type, input.source_id));

    if (draft.items.length === 0) {
      throw new Error("No hay items para confirmar.");
    }

    const createdPurchaseIds: string[] = [];

    for (const group of draft.groups) {
      const subtotal = group.items.reduce((total, item) => total + normalizeNonNegative(item.subtotal), 0);
      const noteParts = [normalizeString(input.notas), `Origen: ${input.source_label}`].filter(Boolean);

      const purchasePayload: PurchaseInsert = {
        profile_id: context.userId,
        source_type: input.source_type,
        source_id: input.source_id,
        supplier_id: group.supplierId,
        fecha_emision: normalizeDate(input.fecha_emision),
        fecha_entrega_estimada: normalizeString(input.fecha_entrega_estimada),
        status: "pending",
        moneda: normalizeString(input.moneda) ?? "ARS",
        subtotal_snapshot: subtotal,
        impuestos_snapshot: 0,
        total_snapshot: subtotal,
        notas: noteParts.join(" | ") || null,
        created_by: context.userId,
        updated_by: context.userId,
        deleted_at: null,
        deleted_by: null,
      };

      const purchaseResponse = (await context.client
        .from(PURCHASES_TABLE as never)
        .insert(purchasePayload as never)
        .select(PURCHASES_SELECT)
        .single()) as QueryResponse<PurchaseRowWithSupplier>;

      if (purchaseResponse.error || !purchaseResponse.data) {
        throw new Error(purchaseResponse.error?.message || "No se pudo crear la compra.");
      }
      const createdPurchase = purchaseResponse.data;

      const itemRows: PurchaseItemInsert[] = group.items.map((item) => ({
        profile_id: context.userId,
        purchase_id: createdPurchase.id,
        material_id: item.materialId,
        supplier_id: item.supplierId,
        descripcion_snapshot: item.description,
        cantidad: normalizeNonNegative(item.quantity),
        unidad_snapshot: item.unit,
        costo_unitario_snapshot: normalizeNonNegative(item.unitCost),
        subtotal_snapshot: normalizeNonNegative(item.subtotal),
        cantidad_recibida: 0,
        estado: "pending",
        created_by: context.userId,
        updated_by: context.userId,
        deleted_at: null,
        deleted_by: null,
      }));

      if (itemRows.length > 0) {
        const itemsResponse = (await context.client
          .from(PURCHASE_ITEMS_TABLE as never)
          .insert(itemRows as never)) as MutationResponse;

        if (itemsResponse.error) {
          throw new Error(itemsResponse.error.message);
        }
      }

      createdPurchaseIds.push(createdPurchase.id);
    }

    const details = await Promise.all(
      createdPurchaseIds.map((purchaseId) => getPurchaseDetailWithContext(context, purchaseId)),
    );

    return details.filter((detail): detail is PurchaseDetailRecord => Boolean(detail));
  },

  async updateHeader(purchaseId: string, input: PurchaseHeaderUpdateInput): Promise<PurchaseDetailRecord> {
    const context = await getAuthorizedContext();

    const payload: PurchaseUpdate = {
      fecha_entrega_estimada:
        input.fecha_entrega_estimada === undefined ? undefined : normalizeString(input.fecha_entrega_estimada),
      notas: input.notas === undefined ? undefined : normalizeString(input.notas),
      updated_by: context.userId,
    };

    const response = (await context.client
      .from(PURCHASES_TABLE as never)
      .update(payload as never)
      .eq("id", purchaseId)
      .eq("profile_id", context.userId)) as MutationResponse;

    if (response.error) {
      throw new Error(response.error.message);
    }

    const detail = await getPurchaseDetailWithContext(context, purchaseId);
    if (!detail) {
      throw new Error("No se pudo recuperar la compra actualizada.");
    }

    return detail;
  },

  async updateItemReceipt(
    purchaseId: string,
    itemId: string,
    input: PurchaseItemReceiptUpdateInput,
  ): Promise<PurchaseDetailRecord> {
    const context = await getAuthorizedContext();

    const itemResponse = (await context.client
      .from(PURCHASE_ITEMS_TABLE as never)
      .select("*")
      .eq("id", itemId)
      .eq("purchase_id", purchaseId)
      .eq("profile_id", context.userId)
      .maybeSingle()) as QueryResponse<PurchaseItemRow>;

    if (itemResponse.error) {
      throw new Error(itemResponse.error.message);
    }

    if (!itemResponse.data) {
      throw new Error("No se encontro el item de compra.");
    }

    const quantity = normalizeNonNegative(itemResponse.data.cantidad);
    const receivedQuantity = Math.min(quantity, normalizeNonNegative(input.cantidad_recibida));
    const itemStatus = resolvePurchaseItemStatus({
      quantity,
      receivedQuantity,
    });

    const updatePayload: PurchaseItemUpdate = {
      cantidad_recibida: receivedQuantity,
      estado: itemStatus,
      updated_by: context.userId,
    };

    const updateResponse = (await context.client
      .from(PURCHASE_ITEMS_TABLE as never)
      .update(updatePayload as never)
      .eq("id", itemId)
      .eq("purchase_id", purchaseId)
      .eq("profile_id", context.userId)) as MutationResponse;

    if (updateResponse.error) {
      throw new Error(updateResponse.error.message);
    }

    const items = await getPurchaseItemsWithContext(context, purchaseId);
    const purchaseStatus = resolvePurchaseStatus(
      items.map((item) => ({
        quantity: normalizeNonNegative(item.cantidad),
        receivedQuantity: normalizeNonNegative(item.cantidad_recibida),
      })),
    );
    await updatePurchaseStatusWithContext(context, purchaseId, purchaseStatus);

    const detail = await getPurchaseDetailWithContext(context, purchaseId);
    if (!detail) {
      throw new Error("No se pudo recuperar la compra actualizada.");
    }

    return detail;
  },
};
