import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  calculateEcommerceProductCost,
  calculateRealMarginPct,
  type CostingGlobalSettingsInput,
} from "@/domain/costing";
import type { TableInsert, TableRow, TableUpdate } from "@/types";
import { settingsService } from "@/services/settings";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/services/supabase/browser-client";

const PRODUCTS_TABLE = "ecommerce_products" as const;
const PRODUCT_MATERIALS_TABLE = "ecommerce_product_materials" as const;
const PRODUCT_PROCESSES_TABLE = "ecommerce_product_processes" as const;
const MATERIALS_TABLE = "materials" as const;

const PRODUCTS_SELECT = "*";
const PRODUCT_MATERIALS_SELECT =
  "*, material:materials(id, codigo, nombre, unidad, costo_unitario, espesor_mm, activo)";

type QueryResponse<T> = {
  data: T | null;
  error: PostgrestError | null;
};

type MutationResponse = {
  error: PostgrestError | null;
};

interface AuthorizedContext {
  client: SupabaseClient;
  userId: string;
}

interface ProductsListQuery {
  eq: (column: string, value: string | boolean) => ProductsListQuery;
  is: (column: string, value: null) => ProductsListQuery;
  or: (query: string) => ProductsListQuery;
  order: (
    column: string,
    options?: { ascending?: boolean },
  ) => Promise<QueryResponse<EcommerceProductRow[]>>;
}

interface ProductByIdQuery {
  is: (column: string, value: null) => ProductByIdQuery;
  maybeSingle: () => Promise<QueryResponse<EcommerceProductRow>>;
}

export const ECOMMERCE_STATUS_OPTIONS = [
  "draft",
  "active",
  "paused",
  "archived",
] as const;

export const ECOMMERCE_STATUS_LABELS: Record<(typeof ECOMMERCE_STATUS_OPTIONS)[number], string> = {
  draft: "Borrador",
  active: "Activo",
  paused: "Pausado",
  archived: "Archivado",
};

export const ECOMMERCE_PROCESS_OPTIONS = [
  "diseno",
  "corte",
  "enchapado",
  "perforado",
  "armado",
  "instalacion",
] as const;

export const ECOMMERCE_PROCESS_LABELS: Record<
  (typeof ECOMMERCE_PROCESS_OPTIONS)[number],
  string
> = {
  diseno: "Diseno",
  corte: "Corte",
  enchapado: "Enchapado",
  perforado: "Perforado",
  armado: "Armado",
  instalacion: "Instalacion",
};

export const ECOMMERCE_CHANNEL_OPTIONS = [
  "venta_directa",
  "marketplace",
  "tienda_propia",
] as const;

export const ECOMMERCE_CHANNEL_LABELS: Record<(typeof ECOMMERCE_CHANNEL_OPTIONS)[number], string> = {
  venta_directa: "Venta directa",
  marketplace: "Marketplace",
  tienda_propia: "Tienda propia",
};

export type EcommerceStatusValue = (typeof ECOMMERCE_STATUS_OPTIONS)[number];
export type EcommerceProcessKey = (typeof ECOMMERCE_PROCESS_OPTIONS)[number];
export type EcommerceChannelKey = (typeof ECOMMERCE_CHANNEL_OPTIONS)[number];

type EcommerceProductRow = TableRow<typeof PRODUCTS_TABLE>;
type EcommerceProductInsert = TableInsert<typeof PRODUCTS_TABLE>;
type EcommerceProductUpdate = TableUpdate<typeof PRODUCTS_TABLE>;
type EcommerceMaterialRow = TableRow<typeof PRODUCT_MATERIALS_TABLE>;
type EcommerceMaterialInsert = TableInsert<typeof PRODUCT_MATERIALS_TABLE>;
type EcommerceProcessRow = TableRow<typeof PRODUCT_PROCESSES_TABLE>;
type EcommerceProcessInsert = TableInsert<typeof PRODUCT_PROCESSES_TABLE>;
type MaterialSourceRow = Pick<
  TableRow<typeof MATERIALS_TABLE>,
  "id" | "codigo" | "nombre" | "unidad" | "costo_unitario" | "espesor_mm"
>;

interface EcommerceMaterialRowWithMaterial extends EcommerceMaterialRow {
  material: {
    id: string;
    codigo: string;
    nombre: string;
    unidad: string;
    costo_unitario: number;
    espesor_mm: number | null;
    activo: boolean;
  } | null;
}

export interface EcommerceProductRecord extends EcommerceProductRow {
  status: EcommerceStatusValue;
  precio_evaluado: number;
  margen_real_pct: number;
}

export type EcommerceMaterialRecord = EcommerceMaterialRowWithMaterial;
export type EcommerceProcessRecord = EcommerceProcessRow;

export interface EcommerceProductDetailRecord {
  product: EcommerceProductRecord;
  materials: EcommerceMaterialRecord[];
  processes: EcommerceProcessRecord[];
}

export interface EcommerceProductsListFilters {
  search?: string;
  status?: string;
  include_deleted?: boolean;
}

export interface EcommerceProductDraftInput {
  id?: string;
  sku: string;
  nombre: string;
  categoria: string;
  precio_mercado: number | null;
  ancho_mm: number | null;
  alto_mm: number | null;
  profundidad_mm: number | null;
  unidades_lote: number;
  estado: EcommerceStatusValue;
  embalaje_unitario: number;
  envio_unitario: number;
}

export interface EcommerceMaterialDraftInput {
  material_id: string;
  consumo_unit: number;
  costo_unitario: number;
}

export interface EcommerceProcessDraftInput {
  proceso_key: EcommerceProcessKey;
  proceso_nombre?: string;
  horas_unit: number;
  costo_hora: number | null;
}

export interface EcommerceProductBundleMutationInput {
  product: EcommerceProductDraftInput;
  materials: EcommerceMaterialDraftInput[];
  processes: EcommerceProcessDraftInput[];
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

function normalizeNullableNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function normalizeNonNegative(value: number | null | undefined) {
  return Math.max(0, normalizeNumber(value));
}

function normalizeStatus(value: string | null | undefined): EcommerceStatusValue {
  const normalized = value?.trim().toLowerCase() ?? "";
  return ECOMMERCE_STATUS_OPTIONS.includes(normalized as EcommerceStatusValue)
    ? (normalized as EcommerceStatusValue)
    : "draft";
}

function normalizeProcessKey(value: string): EcommerceProcessKey {
  const normalized = value.trim().toLowerCase();
  return ECOMMERCE_PROCESS_OPTIONS.includes(normalized as EcommerceProcessKey)
    ? (normalized as EcommerceProcessKey)
    : "armado";
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

function mapProductRecord(row: EcommerceProductRow): EcommerceProductRecord {
  const precioEvaluado = row.precio_mercado > 0 ? row.precio_mercado : row.precio_sugerido;
  return {
    ...row,
    status: normalizeStatus(row.status),
    precio_evaluado: precioEvaluado,
    margen_real_pct: calculateRealMarginPct(precioEvaluado, row.costo_total_canal),
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

async function getMaterialSourceMap(context: AuthorizedContext, materialIds: string[]) {
  if (materialIds.length === 0) {
    return new Map<string, MaterialSourceRow>();
  }

  const response = (await context.client
    .from(MATERIALS_TABLE as never)
    .select("id, codigo, nombre, unidad, costo_unitario, espesor_mm")
    .eq("profile_id", context.userId)
    .in("id", materialIds)
    .is("deleted_at", null)) as QueryResponse<MaterialSourceRow[]>;

  if (response.error) {
    throw new Error(response.error.message);
  }

  return new Map((response.data ?? []).map((material) => [material.id, material]));
}

export const ecommerceService = {
  async list(filters: EcommerceProductsListFilters = {}): Promise<EcommerceProductRecord[]> {
    const { client, userId } = await getAuthorizedContext();

    let query = client
      .from(PRODUCTS_TABLE as never)
      .select(PRODUCTS_SELECT) as unknown as ProductsListQuery;
    query = query.eq("profile_id", userId);

    if (!filters.include_deleted) {
      query = query.is("deleted_at", null);
    }

    if (filters.search?.trim()) {
      const escaped = filters.search.trim().replace(/,/g, " ");
      query = query.or(
        [
          `sku.ilike.%${escaped}%`,
          `nombre.ilike.%${escaped}%`,
          `categoria.ilike.%${escaped}%`,
          `status.ilike.%${escaped}%`,
        ].join(","),
      );
    }

    if (filters.status) {
      query = query.eq("status", normalizeStatus(filters.status));
    }

    const response = (await query.order("updated_at", { ascending: false })) as QueryResponse<
      EcommerceProductRow[]
    >;
    if (response.error) {
      throw new Error(response.error.message);
    }

    return (response.data ?? []).map(mapProductRecord);
  },

  async getById(productId: string, includeDeleted = true): Promise<EcommerceProductRecord | null> {
    const { client, userId } = await getAuthorizedContext();

    let query = client
      .from(PRODUCTS_TABLE as never)
      .select(PRODUCTS_SELECT)
      .eq("id", productId)
      .eq("profile_id", userId) as unknown as ProductByIdQuery;

    if (!includeDeleted) {
      query = query.is("deleted_at", null);
    }

    const response = (await query.maybeSingle()) as QueryResponse<EcommerceProductRow>;
    if (response.error) {
      throw new Error(response.error.message);
    }
    if (!response.data) {
      return null;
    }

    return mapProductRecord(response.data);
  },

  async getMaterials(productId: string): Promise<EcommerceMaterialRecord[]> {
    const { client, userId } = await getAuthorizedContext();

    const response = (await client
      .from(PRODUCT_MATERIALS_TABLE as never)
      .select(PRODUCT_MATERIALS_SELECT)
      .eq("profile_id", userId)
      .eq("ecommerce_product_id", productId)
      .order("created_at", { ascending: true })) as QueryResponse<EcommerceMaterialRecord[]>;

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data ?? [];
  },

  async getProcesses(productId: string): Promise<EcommerceProcessRecord[]> {
    const { client, userId } = await getAuthorizedContext();

    const response = (await client
      .from(PRODUCT_PROCESSES_TABLE as never)
      .select("*")
      .eq("profile_id", userId)
      .eq("ecommerce_product_id", productId)
      .order("line_order", { ascending: true })) as QueryResponse<EcommerceProcessRecord[]>;

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data ?? [];
  },

  async getDetail(productId: string): Promise<EcommerceProductDetailRecord | null> {
    const [product, materials, processes] = await Promise.all([
      this.getById(productId, true),
      this.getMaterials(productId),
      this.getProcesses(productId),
    ]);

    if (!product) {
      return null;
    }

    return {
      product,
      materials,
      processes,
    };
  },

  async saveBundle(input: EcommerceProductBundleMutationInput): Promise<EcommerceProductDetailRecord> {
    const context = await getAuthorizedContext();
    const settings = await settingsService.getCurrent();
    const costingSettings = mapSettingsToCostingInput(settings);

    const normalizedMaterials = input.materials.map((line) => ({
      material_id: line.material_id,
      consumo_unit: normalizeNonNegative(line.consumo_unit),
      costo_unitario: normalizeNonNegative(line.costo_unitario),
    }));

    const normalizedProcesses = input.processes.map((line) => ({
      proceso_key: normalizeProcessKey(line.proceso_key),
      proceso_nombre: normalizeString(line.proceso_nombre),
      horas_unit: normalizeNonNegative(line.horas_unit),
      costo_hora: normalizeNullableNumber(line.costo_hora),
    }));

    const materialIds = Array.from(
      new Set(normalizedMaterials.map((line) => line.material_id).filter(Boolean)),
    );
    const materialSourceMap = await getMaterialSourceMap(context, materialIds);

    for (const line of normalizedMaterials) {
      if (!materialSourceMap.get(line.material_id)) {
        throw new Error("Uno o mas materiales no existen o estan archivados.");
      }
    }

    const costMaterials = normalizedMaterials.map((line) => {
      const material = materialSourceMap.get(line.material_id)!;
      return {
        materialId: material.id,
        descripcion: material.nombre,
        quantity: line.consumo_unit,
        unitCost: line.costo_unitario || Number(material.costo_unitario || 0),
      };
    });

    const costLabor = normalizedProcesses.map((line) => ({
      processKey: line.proceso_key,
      processName: line.proceso_nombre || ECOMMERCE_PROCESS_LABELS[line.proceso_key],
      hours: line.horas_unit,
      hourlyCost: line.costo_hora ?? settings.costo_hora_taller,
    }));

    const marketPrice = normalizeNullableNumber(input.product.precio_mercado);
    const packagingCost = normalizeNonNegative(input.product.embalaje_unitario);
    const shippingCost = normalizeNonNegative(input.product.envio_unitario);
    const unitsPerBatch = Math.max(1, Math.floor(normalizeNonNegative(input.product.unidades_lote)));

    const costResult = calculateEcommerceProductCost({
      settings: costingSettings,
      materials: costMaterials,
      labor: costLabor,
      packagingUnitCost: packagingCost,
      shippingUnitCost: shippingCost,
      marketPrice,
      marginPct: costingSettings.margenEcommercePct,
      applyGlobalMaterialWaste: true,
      includeCommercialCharges: true,
    });

    const costoConEmbalaje = costResult.costoDirectoUnit + packagingCost + settings.embalaje_promedio;

    const productPayload: EcommerceProductUpdate = {
      sku: input.product.sku.trim(),
      nombre: input.product.nombre.trim(),
      categoria: normalizeString(input.product.categoria),
      precio_mercado: normalizeNonNegative(marketPrice),
      ancho: normalizeNullableNumber(input.product.ancho_mm),
      alto: normalizeNullableNumber(input.product.alto_mm),
      profundidad: normalizeNullableNumber(input.product.profundidad_mm),
      unidades_lote: unitsPerBatch,
      horas_proceso_unit: costResult.horasTotalesUnit,
      embalaje_unitario: packagingCost,
      envio_unitario: shippingCost,
      costo_materiales_unit: costResult.costoMaterialesUnit,
      costo_mano_obra_unit: costResult.costoManoObraUnit,
      costo_base_unit: costResult.costoDirectoUnit,
      costo_con_embalaje: costoConEmbalaje,
      costo_total_canal: costResult.costoTotalUnit,
      precio_sugerido: costResult.precioSugerido,
      ganancia_unit: costResult.utilidadUnit,
      status: normalizeStatus(input.product.estado),
      updated_by: context.userId,
      deleted_at: null,
      deleted_by: null,
    };

    const productResponse = input.product.id
      ? ((await context.client
          .from(PRODUCTS_TABLE as never)
          .update(productPayload as never)
          .eq("id", input.product.id)
          .eq("profile_id", context.userId)
          .select(PRODUCTS_SELECT)
          .single()) as QueryResponse<EcommerceProductRow>)
      : ((await context.client
          .from(PRODUCTS_TABLE as never)
          .insert(
            {
              ...(productPayload as EcommerceProductInsert),
              profile_id: context.userId,
              created_by: context.userId,
            } as never,
          )
          .select(PRODUCTS_SELECT)
          .single()) as QueryResponse<EcommerceProductRow>);

    if (productResponse.error || !productResponse.data) {
      throw new Error(productResponse.error?.message || "No se pudo guardar el producto.");
    }

    const productId = productResponse.data.id;

    const deleteMaterialsResponse = (await context.client
      .from(PRODUCT_MATERIALS_TABLE as never)
      .delete()
      .eq("profile_id", context.userId)
      .eq("ecommerce_product_id", productId)) as MutationResponse;

    if (deleteMaterialsResponse.error) {
      throw new Error(deleteMaterialsResponse.error.message);
    }

    const deleteProcessesResponse = (await context.client
      .from(PRODUCT_PROCESSES_TABLE as never)
      .delete()
      .eq("profile_id", context.userId)
      .eq("ecommerce_product_id", productId)) as MutationResponse;

    if (deleteProcessesResponse.error) {
      throw new Error(deleteProcessesResponse.error.message);
    }

    const materialRows: EcommerceMaterialInsert[] = normalizedMaterials.map((line, index) => {
      const source = materialSourceMap.get(line.material_id)!;
      const costLine = costResult.materials.lines[index];
      return {
        profile_id: context.userId,
        ecommerce_product_id: productId,
        material_id: source.id,
        material_codigo_snapshot: source.codigo,
        material_nombre_snapshot: source.nombre,
        unidad_snapshot: source.unidad,
        consumo_unit: line.consumo_unit,
        costo_unitario_snapshot: costLine.unitCost,
        subtotal_snapshot: costLine.totalSubtotal,
        created_by: context.userId,
        updated_by: context.userId,
      };
    });

    if (materialRows.length > 0) {
      const insertMaterialsResponse = (await context.client
        .from(PRODUCT_MATERIALS_TABLE as never)
        .insert(materialRows as never)) as MutationResponse;

      if (insertMaterialsResponse.error) {
        throw new Error(insertMaterialsResponse.error.message);
      }
    }

    const processRows: EcommerceProcessInsert[] = normalizedProcesses.map((line, index) => {
      const costLine = costResult.labor.lines[index];
      return {
        profile_id: context.userId,
        ecommerce_product_id: productId,
        proceso_key: line.proceso_key,
        proceso_nombre: line.proceso_nombre || ECOMMERCE_PROCESS_LABELS[line.proceso_key],
        horas_unit: line.horas_unit,
        costo_hora_snapshot: costLine.hourlyCost,
        subtotal_snapshot: costLine.subtotal,
        line_order: index + 1,
        created_by: context.userId,
        updated_by: context.userId,
      };
    });

    if (processRows.length > 0) {
      const insertProcessesResponse = (await context.client
        .from(PRODUCT_PROCESSES_TABLE as never)
        .insert(processRows as never)) as MutationResponse;

      if (insertProcessesResponse.error) {
        throw new Error(insertProcessesResponse.error.message);
      }
    }

    const detail = await this.getDetail(productId);
    if (!detail) {
      throw new Error("No se pudo recuperar el detalle del producto.");
    }

    return detail;
  },

  async duplicate(productId: string): Promise<EcommerceProductDetailRecord> {
    const detail = await this.getDetail(productId);
    if (!detail) {
      throw new Error("No se encontro el producto a duplicar.");
    }

    const skuSuffix = `COPY-${Date.now().toString().slice(-4)}`;
    return this.saveBundle({
      product: {
        id: undefined,
        sku: `${detail.product.sku}-${skuSuffix}`,
        nombre: `${detail.product.nombre} (Copia)`,
        categoria: detail.product.categoria || "",
        precio_mercado: detail.product.precio_mercado,
        ancho_mm: detail.product.ancho,
        alto_mm: detail.product.alto,
        profundidad_mm: detail.product.profundidad,
        unidades_lote: detail.product.unidades_lote,
        estado: "draft",
        embalaje_unitario: detail.product.embalaje_unitario,
        envio_unitario: detail.product.envio_unitario,
      },
      materials: detail.materials.map((line) => ({
        material_id: line.material_id || "",
        consumo_unit: line.consumo_unit,
        costo_unitario: line.costo_unitario_snapshot,
      })),
      processes: detail.processes.map((line) => ({
        proceso_key: normalizeProcessKey(line.proceso_key),
        proceso_nombre: line.proceso_nombre,
        horas_unit: line.horas_unit,
        costo_hora: line.costo_hora_snapshot,
      })),
    });
  },

  async softDelete(productId: string): Promise<void> {
    const { client, userId } = await getAuthorizedContext();

    const response = (await client
      .from(PRODUCTS_TABLE as never)
      .update(
        {
          deleted_at: new Date().toISOString(),
          deleted_by: userId,
          updated_by: userId,
          status: "archived",
        } as never,
      )
      .eq("id", productId)
      .eq("profile_id", userId)) as MutationResponse;

    if (response.error) {
      throw new Error(response.error.message);
    }
  },

  async restore(productId: string): Promise<void> {
    const { client, userId } = await getAuthorizedContext();

    const response = (await client
      .from(PRODUCTS_TABLE as never)
      .update(
        {
          deleted_at: null,
          deleted_by: null,
          updated_by: userId,
          status: "active",
        } as never,
      )
      .eq("id", productId)
      .eq("profile_id", userId)) as MutationResponse;

    if (response.error) {
      throw new Error(response.error.message);
    }
  },
};
