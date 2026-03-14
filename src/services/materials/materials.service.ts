import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  calculateMaterialAreaM2,
  normalizeMaterialCategory,
  normalizeMaterialUnit,
} from "@/domain/costing/materials";
import type { Database, TableInsert, TableRow, TableUpdate } from "@/types";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/services/supabase/browser-client";

const MATERIALS_TABLE = "materials" as const;
const SUPPLIERS_TABLE = "suppliers" as const;
const MATERIAL_PRICE_HISTORY_TABLE = "material_price_history" as const;
const MATERIAL_PRICE_CATALOG_ITEMS_TABLE = "material_price_catalog_items" as const;
const MATERIALS_SELECT = "*, supplier:suppliers(id, nombre)";

type QueryResponse<T> = {
  data: T | null;
  error: PostgrestError | null;
};

type MutationResponse = {
  error: PostgrestError | null;
};

interface MaterialsListQuery {
  eq: (column: string, value: string | boolean) => MaterialsListQuery;
  is: (column: string, value: null) => MaterialsListQuery;
  or: (query: string) => MaterialsListQuery;
  order: (column: string, options?: { ascending?: boolean }) => Promise<QueryResponse<MaterialRecord[]>>;
}

interface MaterialByIdQuery {
  is: (column: string, value: null) => MaterialByIdQuery;
  maybeSingle: () => Promise<QueryResponse<MaterialRecord>>;
}

interface AuthorizedContext {
  client: SupabaseClient<Database>;
  userId: string;
}

export type MaterialRow = TableRow<typeof MATERIALS_TABLE>;
export type MaterialInsert = TableInsert<typeof MATERIALS_TABLE>;
export type MaterialUpdate = TableUpdate<typeof MATERIALS_TABLE>;
type SupplierRow = TableRow<typeof SUPPLIERS_TABLE>;
export type MaterialPriceHistoryRecord = TableRow<typeof MATERIAL_PRICE_HISTORY_TABLE>;
type MaterialPriceCatalogItemRow = TableRow<typeof MATERIAL_PRICE_CATALOG_ITEMS_TABLE>;
type MaterialPriceHistoryInsert = TableInsert<typeof MATERIAL_PRICE_HISTORY_TABLE>;

export type MaterialSupplierPreview = Pick<SupplierRow, "id" | "nombre">;
export type MaterialRecord = MaterialRow & { supplier: MaterialSupplierPreview | null };

export interface MaterialsListFilters {
  search?: string;
  categoria?: string;
  unidad?: string;
  supplier_id?: string;
  estado?: "all" | "active" | "inactive";
  include_deleted?: boolean;
}

export type MaterialMutationInput = Omit<MaterialInsert, "id" | "profile_id">;

export interface MaterialMutationOptions {
  change_reason?: string | null;
  restore_if_deleted?: boolean;
}

export interface MaterialImportRowInput {
  codigo: string;
  nombre: string;
  categoria: string;
  unidad: string;
  costo_unitario: number;
  supplier_ref?: string | null;
  marca?: string | null;
  espesor_mm?: number | null;
  largo_mm?: number | null;
  ancho_mm?: number | null;
  tiene_veta?: boolean;
  activo?: boolean;
  favorito?: boolean;
  observaciones?: string | null;
}

export interface MaterialImportResult {
  created: number;
  updated: number;
  failed: number;
  errors: Array<{ row: number; message: string }>;
}

export interface MaterialDetailRecord {
  material: MaterialRecord;
  priceHistory: MaterialPriceHistoryRecord[];
}

function normalizeString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function collapseWhitespace(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function normalizeOptionalString(value: string | null | undefined) {
  if (value === undefined) {
    return undefined;
  }

  return normalizeString(value);
}

function normalizeNumber(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return Number.isFinite(value) ? value : null;
}

function normalizeOptionalNumber(value: number | null | undefined) {
  if (value === undefined) {
    return undefined;
  }

  return normalizeNumber(value);
}

function normalizeMoney(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  return Math.round(value * 100) / 100;
}

function numbersAreEqual(a: number | null | undefined, b: number | null | undefined) {
  return Math.abs((a ?? 0) - (b ?? 0)) < 0.0001;
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function inferCatalogMaterialCategory(item: Pick<MaterialPriceCatalogItemRow, "nombre" | "descripcion" | "source_filename">) {
  const fingerprint = `${item.nombre} ${item.descripcion} ${item.source_filename ?? ""}`.toLowerCase();

  if (
    fingerprint.includes("placa") ||
    fingerprint.includes("faplac") ||
    /\b\d{3,5}\s*[x×]\s*\d{3,5}\s*mm\b/i.test(fingerprint)
  ) {
    return "placas";
  }

  if (
    fingerprint.includes("herraje") ||
    fingerprint.includes("grupo euro") ||
    fingerprint.includes("grupoeuro")
  ) {
    return "herrajes";
  }

  return "insumos";
}

function extractCatalogBoardDimensions(description: string) {
  const match = description.match(/(\d{3,5})\s*[x×]\s*(\d{3,5})\s*mm/i);
  if (!match) {
    return { largo_mm: null, ancho_mm: null };
  }

  return {
    largo_mm: Number(match[1]),
    ancho_mm: Number(match[2]),
  };
}

function extractCatalogBoardThickness(description: string) {
  const segments = description.split(",").map((segment) => collapseWhitespace(segment));
  for (const segment of segments.slice(1)) {
    const match = segment.match(/^(\d+(?:[.,]\d+)?)\s*mm\b/i);
    if (match) {
      const value = Number(match[1].replace(",", "."));
      if (Number.isFinite(value)) {
        return value;
      }
    }
  }

  return null;
}

function buildCatalogMaterialCode(item: Pick<MaterialPriceCatalogItemRow, "unique_slug_key">) {
  return `catalog:${item.unique_slug_key}`;
}

function buildCatalogMaterialNotes(item: Pick<MaterialPriceCatalogItemRow, "descripcion" | "color" | "source_filename">) {
  const description = collapseWhitespace(item.descripcion);
  const color = collapseWhitespace(item.color);
  const sourceName = collapseWhitespace(item.source_filename);
  const segments = [description];

  if (color) {
    segments.push(`Color: ${color}`);
  }

  if (sourceName) {
    segments.push(`Origen: ${sourceName}`);
  }

  return segments.filter(Boolean).join(" | ");
}

function mapMaterialInsertPayload(input: MaterialMutationInput, userId: string): MaterialInsert {
  const largoMm = normalizeNumber(input.largo_mm);
  const anchoMm = normalizeNumber(input.ancho_mm);

  return {
    ...input,
    profile_id: userId,
    codigo: input.codigo.trim(),
    nombre: input.nombre.trim(),
    categoria: normalizeMaterialCategory(input.categoria),
    unidad: normalizeMaterialUnit(input.unidad),
    costo_unitario: normalizeMoney(input.costo_unitario),
    supplier_id: normalizeString(input.supplier_id),
    marca: normalizeString(input.marca),
    espesor_mm: normalizeNumber(input.espesor_mm),
    largo_mm: largoMm,
    ancho_mm: anchoMm,
    area_m2: calculateMaterialAreaM2(largoMm, anchoMm),
    tiene_veta: Boolean(input.tiene_veta),
    activo: input.activo ?? true,
    favorito: input.favorito ?? false,
    observaciones: normalizeString(input.observaciones),
    created_by: userId,
    updated_by: userId,
    deleted_at: null,
    deleted_by: null,
  };
}

function mapMaterialUpdatePayload(
  current: MaterialRecord,
  input: MaterialMutationInput,
  userId: string,
  options: MaterialMutationOptions,
): MaterialUpdate {
  const nextLargoMm = input.largo_mm === undefined ? current.largo_mm : normalizeNumber(input.largo_mm);
  const nextAnchoMm = input.ancho_mm === undefined ? current.ancho_mm : normalizeNumber(input.ancho_mm);

  const payload: MaterialUpdate = {
    updated_by: userId,
    codigo: input.codigo?.trim(),
    nombre: input.nombre?.trim(),
    categoria: input.categoria ? normalizeMaterialCategory(input.categoria) : undefined,
    unidad: input.unidad ? normalizeMaterialUnit(input.unidad) : undefined,
    costo_unitario:
      input.costo_unitario === undefined ? undefined : normalizeMoney(input.costo_unitario),
    supplier_id: normalizeOptionalString(input.supplier_id),
    marca: normalizeOptionalString(input.marca),
    espesor_mm: normalizeOptionalNumber(input.espesor_mm),
    largo_mm: input.largo_mm === undefined ? undefined : normalizeNumber(input.largo_mm),
    ancho_mm: input.ancho_mm === undefined ? undefined : normalizeNumber(input.ancho_mm),
    area_m2: calculateMaterialAreaM2(nextLargoMm, nextAnchoMm),
    tiene_veta: input.tiene_veta === undefined ? undefined : Boolean(input.tiene_veta),
    activo: input.activo,
    favorito: input.favorito,
    observaciones: normalizeOptionalString(input.observaciones),
  };

  if (options.restore_if_deleted) {
    payload.deleted_at = null;
    payload.deleted_by = null;
  }

  return payload;
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

async function getMaterialByIdWithContext(
  context: AuthorizedContext,
  materialId: string,
  includeDeleted = true,
): Promise<MaterialRecord | null> {
  let query = context.client
    .from(MATERIALS_TABLE as never)
    .select(MATERIALS_SELECT)
    .eq("id", materialId)
    .eq("profile_id", context.userId) as unknown as MaterialByIdQuery;

  if (!includeDeleted) {
    query = query.is("deleted_at", null);
  }

  const response = (await query.maybeSingle()) as QueryResponse<MaterialRecord>;
  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data;
}

async function registerMaterialPriceChange(
  context: AuthorizedContext,
  params: {
    materialId: string;
    priceOld: number;
    priceNew: number;
    changeReason?: string | null;
  },
) {
  const oldValue = normalizeMoney(params.priceOld);
  const newValue = normalizeMoney(params.priceNew);

  if (numbersAreEqual(oldValue, newValue)) {
    return;
  }

  const effectiveFrom = new Date().toISOString();

  const closeOpenResponse = (await context.client
    .from(MATERIAL_PRICE_HISTORY_TABLE as never)
    .update(
      {
        effective_to: effectiveFrom,
        updated_by: context.userId,
      } as never,
    )
    .eq("profile_id", context.userId)
    .eq("material_id", params.materialId)
    .is("effective_to", null)) as QueryResponse<MaterialPriceHistoryRecord[]>;

  if (closeOpenResponse.error) {
    throw new Error(closeOpenResponse.error.message);
  }

  const payload: MaterialPriceHistoryInsert = {
    profile_id: context.userId,
    material_id: params.materialId,
    price_old: oldValue,
    price_new: newValue,
    change_reason: normalizeString(params.changeReason) ?? null,
    effective_from: effectiveFrom,
    effective_to: null,
    created_by: context.userId,
    updated_by: context.userId,
  };

  const insertResponse = (await context.client
    .from(MATERIAL_PRICE_HISTORY_TABLE as never)
    .insert(payload as never)) as MutationResponse;

  if (insertResponse.error) {
    throw new Error(insertResponse.error.message);
  }
}

async function createMaterialWithContext(
  context: AuthorizedContext,
  input: MaterialMutationInput,
  options: MaterialMutationOptions = {},
): Promise<MaterialRecord> {
  const payload = mapMaterialInsertPayload(input, context.userId);

  const response = (await context.client
    .from(MATERIALS_TABLE as never)
    .insert(payload as never)
    .select(MATERIALS_SELECT)
    .single()) as QueryResponse<MaterialRecord>;

  if (response.error || !response.data) {
    throw new Error(response.error?.message || "No se pudo crear el material.");
  }

  await registerMaterialPriceChange(context, {
    materialId: response.data.id,
    priceOld: 0,
    priceNew: payload.costo_unitario ?? 0,
    changeReason: options.change_reason ?? "Alta de material",
  });

  return response.data;
}

async function updateMaterialWithContext(
  context: AuthorizedContext,
  materialId: string,
  input: MaterialMutationInput,
  options: MaterialMutationOptions = {},
): Promise<MaterialRecord> {
  const current = await getMaterialByIdWithContext(context, materialId, true);
  if (!current) {
    throw new Error("No se encontro el material solicitado.");
  }

  const payload = mapMaterialUpdatePayload(current, input, context.userId, options);

  const response = (await context.client
    .from(MATERIALS_TABLE as never)
    .update(payload as never)
    .eq("id", materialId)
    .eq("profile_id", context.userId)
    .select(MATERIALS_SELECT)
    .single()) as QueryResponse<MaterialRecord>;

  if (response.error || !response.data) {
    throw new Error(response.error?.message || "No se pudo actualizar el material.");
  }

  if (!numbersAreEqual(current.costo_unitario, response.data.costo_unitario)) {
    await registerMaterialPriceChange(context, {
      materialId: response.data.id,
      priceOld: current.costo_unitario,
      priceNew: response.data.costo_unitario,
      changeReason: options.change_reason ?? "Actualizacion manual",
    });
  }

  return response.data;
}

async function syncCatalogItemsIntoMaterials(context: AuthorizedContext): Promise<boolean> {
  const [catalogResponse, existingResponse] = (await Promise.all([
    context.client
      .from(MATERIAL_PRICE_CATALOG_ITEMS_TABLE as never)
      .select("id, supplier_id, source_filename, nombre, descripcion, color, precio, unique_slug_key, is_active")
      .eq("profile_id", context.userId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false }),
    context.client
      .from(MATERIALS_TABLE as never)
      .select("id, codigo")
      .eq("profile_id", context.userId),
  ])) as [
    QueryResponse<
      Array<
        Pick<
          MaterialPriceCatalogItemRow,
          | "id"
          | "supplier_id"
          | "source_filename"
          | "nombre"
          | "descripcion"
          | "color"
          | "precio"
          | "unique_slug_key"
          | "is_active"
        >
      >
    >,
    QueryResponse<Array<Pick<MaterialRow, "id" | "codigo">>>,
  ];

  if (catalogResponse.error) {
    throw new Error(catalogResponse.error.message);
  }

  if (existingResponse.error) {
    throw new Error(existingResponse.error.message);
  }

  const catalogItems = catalogResponse.data ?? [];
  if (catalogItems.length === 0) {
    return false;
  }

  const materialByCode = new Map<string, string>(
    (existingResponse.data ?? []).map((item) => [item.codigo.trim().toLowerCase(), item.id]),
  );

  let hasChanges = false;

  for (const item of catalogItems) {
    const category = inferCatalogMaterialCategory(item);
    const description = collapseWhitespace(item.descripcion);
    const dimensions =
      category === "placas"
        ? extractCatalogBoardDimensions(description)
        : { largo_mm: null, ancho_mm: null };
    const code = buildCatalogMaterialCode(item).trim().toLowerCase();
    const payload: MaterialMutationInput = {
      codigo: buildCatalogMaterialCode(item),
      nombre: collapseWhitespace(item.nombre),
      categoria: category,
      unidad: "unidad",
      costo_unitario: normalizeMoney(Number(item.precio ?? 0)),
      supplier_id: item.supplier_id,
      marca: null,
      espesor_mm: category === "placas" ? extractCatalogBoardThickness(description) : null,
      largo_mm: dimensions.largo_mm,
      ancho_mm: dimensions.ancho_mm,
      tiene_veta: false,
      activo: Boolean(item.is_active),
      favorito: false,
      observaciones: buildCatalogMaterialNotes(item),
    };

    const existingId = materialByCode.get(code);

    if (existingId) {
      await updateMaterialWithContext(context, existingId, payload, {
        change_reason: "Sincronizacion automatica desde catalogo de precios",
        restore_if_deleted: true,
      });
    } else {
      const created = await createMaterialWithContext(context, payload, {
        change_reason: "Sincronizacion automatica desde catalogo de precios",
      });
      materialByCode.set(code, created.id);
    }

    hasChanges = true;
  }

  return hasChanges;
}

function shouldAttemptCatalogSync(filters: MaterialsListFilters) {
  return !filters.search?.trim() && !filters.categoria && !filters.unidad && !filters.supplier_id;
}

export const materialsService = {
  async list(filters: MaterialsListFilters = {}): Promise<MaterialRecord[]> {
    const { client, userId } = await getAuthorizedContext();

    let query = client
      .from(MATERIALS_TABLE as never)
      .select(MATERIALS_SELECT) as unknown as MaterialsListQuery;
    query = query.eq("profile_id", userId);

    if (!filters.include_deleted) {
      query = query.is("deleted_at", null);
    }

    if (filters.search?.trim()) {
      const escaped = filters.search.trim().replace(/,/g, " ");
      query = query.or(
        [
          `codigo.ilike.%${escaped}%`,
          `nombre.ilike.%${escaped}%`,
          `marca.ilike.%${escaped}%`,
          `observaciones.ilike.%${escaped}%`,
        ].join(","),
      );
    }

    if (filters.categoria) {
      query = query.eq("categoria", normalizeMaterialCategory(filters.categoria));
    }

    if (filters.unidad) {
      query = query.eq("unidad", normalizeMaterialUnit(filters.unidad));
    }

    if (filters.supplier_id) {
      query = query.eq("supplier_id", filters.supplier_id);
    }

    if (filters.estado === "active") {
      query = query.eq("activo", true);
    }

    if (filters.estado === "inactive") {
      query = query.eq("activo", false);
    }

    const response = (await query.order("updated_at", { ascending: false })) as QueryResponse<
      MaterialRecord[]
    >;

    if (response.error) {
      throw new Error(response.error.message);
    }

    const records = response.data ?? [];

    if (records.length === 0 && shouldAttemptCatalogSync(filters)) {
      const synced = await syncCatalogItemsIntoMaterials({ client, userId });
      if (synced) {
        return this.list(filters);
      }
    }

    return records;
  },

  async getById(materialId: string, includeDeleted = true): Promise<MaterialRecord | null> {
    const context = await getAuthorizedContext();
    return getMaterialByIdWithContext(context, materialId, includeDeleted);
  },

  async create(input: MaterialMutationInput, options: MaterialMutationOptions = {}) {
    const context = await getAuthorizedContext();
    return createMaterialWithContext(context, input, options);
  },

  async update(
    materialId: string,
    input: MaterialMutationInput,
    options: MaterialMutationOptions = {},
  ) {
    const context = await getAuthorizedContext();
    return updateMaterialWithContext(context, materialId, input, options);
  },

  async setActive(materialId: string, active: boolean) {
    const { client, userId } = await getAuthorizedContext();

    const response = (await client
      .from(MATERIALS_TABLE as never)
      .update(
        {
          activo: active,
          updated_by: userId,
        } as never,
      )
      .eq("id", materialId)
      .eq("profile_id", userId)) as MutationResponse;

    if (response.error) {
      throw new Error(response.error.message);
    }
  },

  async softDelete(materialId: string) {
    const { client, userId } = await getAuthorizedContext();

    const response = (await client
      .from(MATERIALS_TABLE as never)
      .update(
        {
          deleted_at: new Date().toISOString(),
          deleted_by: userId,
          updated_by: userId,
        } as never,
      )
      .eq("id", materialId)
      .eq("profile_id", userId)) as MutationResponse;

    if (response.error) {
      throw new Error(response.error.message);
    }
  },

  async restore(materialId: string) {
    const { client, userId } = await getAuthorizedContext();

    const response = (await client
      .from(MATERIALS_TABLE as never)
      .update(
        {
          deleted_at: null,
          deleted_by: null,
          updated_by: userId,
        } as never,
      )
      .eq("id", materialId)
      .eq("profile_id", userId)) as MutationResponse;

    if (response.error) {
      throw new Error(response.error.message);
    }
  },

  async getPriceHistory(materialId: string, limit = 50): Promise<MaterialPriceHistoryRecord[]> {
    const { client, userId } = await getAuthorizedContext();

    const response = (await client
      .from(MATERIAL_PRICE_HISTORY_TABLE as never)
      .select("*")
      .eq("profile_id", userId)
      .eq("material_id", materialId)
      .order("effective_from", { ascending: false })
      .limit(limit)) as QueryResponse<MaterialPriceHistoryRecord[]>;

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data ?? [];
  },

  async getDetail(materialId: string): Promise<MaterialDetailRecord | null> {
    const [material, priceHistory] = await Promise.all([
      this.getById(materialId, true),
      this.getPriceHistory(materialId),
    ]);

    if (!material) {
      return null;
    }

    return {
      material,
      priceHistory,
    };
  },

  async importFromCsv(rows: MaterialImportRowInput[]): Promise<MaterialImportResult> {
    if (rows.length === 0) {
      return { created: 0, updated: 0, failed: 0, errors: [] };
    }

    const context = await getAuthorizedContext();

    const existingResponse = (await context.client
      .from(MATERIALS_TABLE as never)
      .select("id, codigo")
      .eq("profile_id", context.userId)) as QueryResponse<Array<Pick<MaterialRow, "id" | "codigo">>>;

    if (existingResponse.error) {
      throw new Error(existingResponse.error.message);
    }

    const suppliersResponse = (await context.client
      .from(SUPPLIERS_TABLE as never)
      .select("id, nombre")
      .eq("profile_id", context.userId)
      .is("deleted_at", null)) as QueryResponse<Array<Pick<SupplierRow, "id" | "nombre">>>;

    if (suppliersResponse.error) {
      throw new Error(suppliersResponse.error.message);
    }

    const materialByCode = new Map<string, string>(
      (existingResponse.data ?? []).map((item) => [item.codigo.trim().toLowerCase(), item.id]),
    );

    const suppliersById = new Map<string, string>();
    const suppliersByName = new Map<string, string>();

    for (const supplier of suppliersResponse.data ?? []) {
      suppliersById.set(supplier.id, supplier.id);
      suppliersByName.set(supplier.nombre.trim().toLowerCase(), supplier.id);
    }

    const result: MaterialImportResult = {
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
    };

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];

      try {
        const supplierRef = row.supplier_ref?.trim() || "";
        const supplierId = supplierRef
          ? isUuidLike(supplierRef)
            ? (suppliersById.get(supplierRef) ?? null)
            : (suppliersByName.get(supplierRef.toLowerCase()) ?? null)
          : null;

        const payload: MaterialMutationInput = {
          codigo: row.codigo.trim(),
          nombre: row.nombre.trim(),
          categoria: normalizeMaterialCategory(row.categoria),
          unidad: normalizeMaterialUnit(row.unidad),
          costo_unitario: normalizeMoney(row.costo_unitario),
          supplier_id: supplierId,
          marca: normalizeString(row.marca),
          espesor_mm: normalizeNumber(row.espesor_mm),
          largo_mm: normalizeNumber(row.largo_mm),
          ancho_mm: normalizeNumber(row.ancho_mm),
          tiene_veta: row.tiene_veta ?? false,
          activo: row.activo ?? true,
          favorito: row.favorito ?? false,
          observaciones: normalizeString(row.observaciones),
        };

        const lookupCode = payload.codigo.trim().toLowerCase();
        const existingId = materialByCode.get(lookupCode);

        if (existingId) {
          const updated = await updateMaterialWithContext(context, existingId, payload, {
            change_reason: "Importacion CSV",
            restore_if_deleted: true,
          });
          materialByCode.set(lookupCode, updated.id);
          result.updated += 1;
        } else {
          const created = await createMaterialWithContext(context, payload, {
            change_reason: "Importacion CSV",
          });
          materialByCode.set(lookupCode, created.id);
          result.created += 1;
        }
      } catch (rowError) {
        result.failed += 1;
        result.errors.push({
          row: index + 2,
          message: rowError instanceof Error ? rowError.message : "Error desconocido.",
        });
      }
    }

    return result;
  },
};
