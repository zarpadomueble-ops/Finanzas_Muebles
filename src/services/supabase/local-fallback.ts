import type { PostgrestError } from "@supabase/supabase-js";
import { createSeedState } from "@/lib/data/seed";
import { createId, nowIso, round } from "@/lib/utils";
import type { Json, PublicTableName } from "@/types";

type LocalRow = Record<string, unknown>;
type LocalTableStore = Record<PublicTableName, LocalRow[]>;

type QueryOperation = "select" | "insert" | "update" | "delete" | "upsert";
type ResultMode = "many" | "single" | "maybeSingle";

interface QueryState {
  table: PublicTableName;
  operation: QueryOperation;
  select?: string;
  filters: QueryFilter[];
  orders: QueryOrder[];
  limit?: number;
  payload?: unknown;
  options?: {
    onConflict?: string;
  };
  resultMode: ResultMode;
}

interface QueryOrder {
  column: string;
  ascending: boolean;
}

type QueryFilter =
  | { kind: "eq"; column: string; value: unknown }
  | { kind: "is"; column: string; value: null }
  | { kind: "in"; column: string; values: unknown[] }
  | { kind: "or"; query: string };

interface LocalDatabaseState {
  version: number;
  tables: LocalTableStore;
}

interface LocalQueryResult<T = unknown> {
  data: T | null;
  error: PostgrestError | null;
}

const STORAGE_VERSION = 1;
const STORAGE_KEY_PREFIX = "carpi-erp-local-db";
const LOCAL_ERROR_CODE = "PGRST205";

const RELATION_FOREIGN_KEYS: Partial<Record<PublicTableName, Partial<Record<PublicTableName, string>>>> = {
  budgets: {
    clients: "client_id",
    custom_projects: "custom_project_id",
  },
  custom_project_materials: {
    materials: "material_id",
  },
  custom_projects: {
    clients: "client_id",
  },
  cut_job_parts: {
    materials: "material_id",
  },
  ecommerce_product_materials: {
    materials: "material_id",
  },
  jobs_board: {
    budgets: "budget_id",
    clients: "client_id",
    custom_projects: "custom_project_id",
  },
  materials: {
    suppliers: "supplier_id",
  },
  purchase_items: {
    materials: "material_id",
    suppliers: "supplier_id",
  },
  purchases: {
    suppliers: "supplier_id",
  },
};

const memoryCache = new Map<string, LocalDatabaseState>();

function buildStorageKey(scopeId: string) {
  return `${STORAGE_KEY_PREFIX}:${scopeId}:v${STORAGE_VERSION}`;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeNullableString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeNumber(value: number | null | undefined, fallback = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return value;
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mapLegacyBudgetStatus(value: string) {
  switch (value) {
    case "aprobado":
      return "approved";
    case "rechazado":
      return "rejected";
    case "borrador":
      return "draft";
    default:
      return "sent";
  }
}

function mapLegacyPurchaseStatus(value: string) {
  switch (value) {
    case "completa":
      return "purchased";
    case "emitida":
      return "pending";
    default:
      return "pending";
  }
}

function buildSeedDatabase(scopeId: string): LocalDatabaseState {
  const seed = createSeedState();
  const settingsUpdatedAt = seed.settings.updatedAt || nowIso();
  const profileRow: LocalRow = {
    id: scopeId,
    full_name: seed.users[0]?.fullName ?? "Usuario",
    email: seed.users[0]?.email ?? null,
    phone: null,
    avatar_url: null,
    locale: "es-AR",
    timezone: "America/Buenos_Aires",
    created_at: seed.users[0]?.createdAt ?? settingsUpdatedAt,
    updated_at: settingsUpdatedAt,
    created_by: scopeId,
    updated_by: scopeId,
    deleted_at: null,
    deleted_by: null,
  };

  const settingsRow: LocalRow = {
    id: seed.settings.id,
    profile_id: scopeId,
    horas_productivas_mes: seed.settings.horasProductivasMes,
    costos_fijos_mes: seed.settings.costosFijosMes,
    costo_hora_taller: seed.settings.costoHoraTaller,
    desperdicio_melamina_pct: seed.settings.desperdicioMelaminaPct,
    margen_medida_pct: seed.settings.margenMedidaPct,
    margen_ecommerce_pct: seed.settings.margenEcommercePct,
    impuestos_pct: seed.settings.impuestosPct,
    publicidad_pct: seed.settings.publicidadPct,
    comision_cobro_pct: seed.settings.comisionCobroPct,
    embalaje_promedio: seed.settings.embalajePromedio,
    envio_promedio: seed.settings.envioPromedio,
    kerf_sierra_mm: seed.settings.kerfSierraMm,
    margen_perimetral_placa_mm: seed.settings.margenPerimetralPlacaMm,
    permitir_rotacion_por_defecto: seed.settings.permitirRotacionPorDefecto,
    veta_obligatoria_por_defecto: seed.settings.vetaObligatoriaPorDefecto,
    is_active: true,
    notes: null,
    created_at: settingsUpdatedAt,
    updated_at: settingsUpdatedAt,
    created_by: scopeId,
    updated_by: scopeId,
    deleted_at: null,
    deleted_by: null,
  };

  const clients = seed.clients.map<LocalRow>((client) => ({
    id: client.id,
    profile_id: scopeId,
    nombre: client.nombre,
    telefono: normalizeNullableString(client.telefono),
    email: normalizeNullableString(client.email),
    direccion: normalizeNullableString(client.direccion),
    ciudad: normalizeNullableString(client.ciudad),
    provincia: normalizeNullableString(client.provincia),
    notas: normalizeNullableString(client.notas),
    canal_ingreso: normalizeNullableString(client.canalIngreso),
    fecha_alta: normalizeNullableString(client.fechaAlta),
    saldo_pendiente: normalizeNumber(client.saldoPendiente),
    created_at: client.createdAt,
    updated_at: client.createdAt,
    created_by: scopeId,
    updated_by: scopeId,
    deleted_at: null,
    deleted_by: null,
  }));

  const suppliers = seed.suppliers.map<LocalRow>((supplier) => ({
    id: supplier.id,
    profile_id: scopeId,
    nombre: supplier.nombre,
    telefono: normalizeNullableString(supplier.telefono),
    email: normalizeNullableString(supplier.email),
    ciudad: normalizeNullableString(supplier.ciudad),
    created_at: supplier.createdAt,
    updated_at: supplier.createdAt,
    created_by: scopeId,
    updated_by: scopeId,
    deleted_at: null,
    deleted_by: null,
  }));

  const materials = seed.materials.map<LocalRow>((material) => ({
    id: material.id,
    profile_id: scopeId,
    codigo: material.codigo,
    nombre: material.nombre,
    categoria: material.categoria,
    unidad: material.unidad,
    costo_unitario: normalizeNumber(material.costoUnitario),
    supplier_id: material.proveedorId,
    marca: normalizeNullableString(material.marca),
    espesor_mm: normalizeNumber(material.espesorMm, 0),
    largo_mm: normalizeNumber(material.largoMm, 0),
    ancho_mm: normalizeNumber(material.anchoMm, 0),
    area_m2: normalizeNumber(material.areaM2, 0),
    tiene_veta: false,
    activo: Boolean(material.activo),
    favorito: Boolean(material.favorito),
    observaciones: normalizeNullableString(material.observaciones),
    created_at: material.createdAt,
    updated_at: material.updatedAt,
    created_by: scopeId,
    updated_by: scopeId,
    deleted_at: null,
    deleted_by: null,
  }));

  const materialPriceHistory = seed.materialCostHistory.map<LocalRow>((entry) => ({
    id: entry.id,
    profile_id: scopeId,
    material_id: entry.materialId,
    price_old: normalizeNumber(entry.costoAnterior),
    price_new: normalizeNumber(entry.costoNuevo),
    change_reason: "Seed inicial",
    effective_from: entry.changedAt,
    effective_to: null,
    created_at: entry.changedAt,
    updated_at: entry.changedAt,
    created_by: scopeId,
    updated_by: scopeId,
  }));

  const projectNameById = new Map(seed.projectsCustom.map((project) => [project.id, project.nombreProyecto]));
  const projectSnapshotById = new Map(
    seed.projectsCustom.map((project) => [
      project.id,
      ({
        version: 1,
        metadata: {
          notas: null,
          precio_final_manual: null,
          precio_evaluado: project.precioSugerido,
          margen_real_pct: project.precioSugerido
            ? round(((project.precioSugerido - project.costoTotal) / project.precioSugerido) * 100, 2)
            : 0,
        },
        costing: null,
      } satisfies Record<string, unknown>) as Json,
    ]),
  );

  const customProjects = seed.projectsCustom.map<LocalRow>((project) => ({
    id: project.id,
    profile_id: scopeId,
    client_id: project.clientId,
    nombre_proyecto: project.nombreProyecto,
    fecha: project.fecha,
    tipo_mueble: normalizeNullableString(project.tipoMueble),
    ancho: normalizeNumber(project.ancho),
    alto: normalizeNumber(project.alto),
    profundidad: normalizeNumber(project.profundidad),
    cantidad: normalizeNumber(project.cantidad, 1),
    descuento_pct: normalizeNumber(project.descuentoPct),
    subtotal_materiales: normalizeNumber(project.subtotalMateriales),
    horas_totales: normalizeNumber(project.horasTotales),
    costo_mano_obra: normalizeNumber(project.costoManoObra),
    costo_directo: normalizeNumber(project.costoDirecto),
    costo_total: normalizeNumber(project.costoTotal),
    precio_sugerido: normalizeNumber(project.precioSugerido),
    utilidad_estimada: normalizeNumber(project.utilidadEstimada),
    status: "approved",
    settings_snapshot: projectSnapshotById.get(project.id) ?? null,
    created_at: project.createdAt,
    updated_at: project.updatedAt,
    created_by: scopeId,
    updated_by: scopeId,
    deleted_at: null,
    deleted_by: null,
  }));

  const materialById = new Map(materials.map((material) => [String(material.id), material]));
  const customProjectMaterials = seed.projectMaterials.map<LocalRow>((line) => {
    const material = materialById.get(line.materialId);
    const timestamp =
      customProjects.find((project) => project.id === line.projectId)?.updated_at ?? settingsUpdatedAt;

    return {
      id: line.id,
      profile_id: scopeId,
      custom_project_id: line.projectId,
      material_id: line.materialId,
      material_codigo_snapshot: material?.codigo ?? null,
      material_nombre_snapshot: material?.nombre ?? line.materialId,
      unidad_snapshot: material?.unidad ?? null,
      espesor_mm_snapshot: (material?.espesor_mm as number | null | undefined) ?? null,
      consumo: normalizeNumber(line.consumo),
      desperdicio_pct: 0,
      costo_unitario_snapshot: normalizeNumber(line.costoUnitarioSnapshot),
      subtotal_snapshot: normalizeNumber(line.subtotal),
      created_at: timestamp,
      updated_at: timestamp,
      created_by: scopeId,
      updated_by: scopeId,
      deleted_at: null,
      deleted_by: null,
    };
  });

  const processLabels: Record<string, string> = {
    diseno: "Diseno",
    corte: "Corte",
    enchapado: "Enchapado",
    perforado: "Perforado",
    armado: "Armado",
    instalacion: "Instalacion",
  };

  const customProjectLabor = seed.projectLabor.map<LocalRow>((line, index) => {
    const project = customProjects.find((row) => row.id === line.projectId);
    return {
      id: line.id,
      profile_id: scopeId,
      custom_project_id: line.projectId,
      proceso_key: line.proceso,
      proceso_nombre: processLabels[line.proceso] ?? line.proceso,
      horas: normalizeNumber(line.horas),
      costo_hora_snapshot: seed.settings.costoHoraTaller,
      subtotal_snapshot: round(normalizeNumber(line.horas) * seed.settings.costoHoraTaller),
      line_order: index + 1,
      created_at: project?.updated_at ?? settingsUpdatedAt,
      updated_at: project?.updated_at ?? settingsUpdatedAt,
      created_by: scopeId,
      updated_by: scopeId,
    };
  });

  const ecommerceProducts = seed.ecommerceProducts.map<LocalRow>((product) => ({
    id: product.id,
    profile_id: scopeId,
    sku: product.sku,
    nombre: product.nombre,
    categoria: normalizeNullableString(product.categoria),
    precio_mercado: normalizeNumber(product.precioMercado),
    ancho: normalizeNumber(product.ancho),
    alto: normalizeNumber(product.alto),
    profundidad: normalizeNumber(product.profundidad),
    unidades_lote: 1,
    horas_proceso_unit: normalizeNumber(product.horasProcesoUnit),
    embalaje_unitario: normalizeNumber(product.embalajeUnitario),
    envio_unitario: normalizeNumber(product.envioUnitario),
    costo_materiales_unit: normalizeNumber(product.costoMaterialesUnit),
    costo_mano_obra_unit: normalizeNumber(product.costoManoObraUnit),
    costo_base_unit: normalizeNumber(product.costoBaseUnit),
    costo_con_embalaje: normalizeNumber(product.costoConEmbalaje),
    costo_total_canal: normalizeNumber(product.costoTotalCanal),
    precio_sugerido: normalizeNumber(product.precioSugerido),
    ganancia_unit: normalizeNumber(product.gananciaUnit),
    status: "active",
    created_at: product.createdAt,
    updated_at: product.updatedAt,
    created_by: scopeId,
    updated_by: scopeId,
    deleted_at: null,
    deleted_by: null,
  }));

  const ecommerceProductMaterials = seed.productMaterials.map<LocalRow>((line) => {
    const material = materialById.get(line.materialId);
    const product = ecommerceProducts.find((row) => row.id === line.productId);

    return {
      id: line.id,
      profile_id: scopeId,
      ecommerce_product_id: line.productId,
      material_id: line.materialId,
      material_codigo_snapshot: material?.codigo ?? null,
      material_nombre_snapshot: material?.nombre ?? line.materialId,
      unidad_snapshot: material?.unidad ?? null,
      consumo_unit: normalizeNumber(line.consumoUnit),
      costo_unitario_snapshot: normalizeNumber(line.costoUnitarioSnapshot),
      subtotal_snapshot: normalizeNumber(line.subtotalUnit),
      created_at: product?.updated_at ?? settingsUpdatedAt,
      updated_at: product?.updated_at ?? settingsUpdatedAt,
      created_by: scopeId,
      updated_by: scopeId,
    };
  });

  const ecommerceProductProcesses = seed.ecommerceProducts.map<LocalRow>((product) => ({
    id: createId(),
    profile_id: scopeId,
    ecommerce_product_id: product.id,
    proceso_key: "armado",
    proceso_nombre: "Armado",
    horas_unit: normalizeNumber(product.horasProcesoUnit),
    costo_hora_snapshot: seed.settings.costoHoraTaller,
    subtotal_snapshot: round(normalizeNumber(product.horasProcesoUnit) * seed.settings.costoHoraTaller),
    line_order: 1,
    created_at: product.updatedAt,
    updated_at: product.updatedAt,
    created_by: scopeId,
    updated_by: scopeId,
  }));

  const cutJobs = seed.cutJobs.map<LocalRow>((job) => ({
    id: job.id,
    profile_id: scopeId,
    nombre: job.nombre,
    largo_placa_mm: normalizeNumber(job.largoPlaca),
    ancho_placa_mm: normalizeNumber(job.anchoPlaca),
    kerf_mm: normalizeNumber(job.kerf),
    margen_perimetral_mm: normalizeNumber(job.margenPerimetral),
    desperdicio_extra_pct: normalizeNumber(job.desperdicioExtra),
    allow_rotation_default: Boolean(job.allowRotationDefault),
    grain_required_default: Boolean(job.grainRequiredDefault),
    iteration_actual: 1,
    placas_necesarias_snapshot: 0,
    aprovechamiento_pct_snapshot: 0,
    desperdicio_pct_snapshot: 0,
    costo_placas_snapshot: 0,
    status: "draft",
    created_at: job.createdAt,
    updated_at: job.updatedAt,
    created_by: scopeId,
    updated_by: scopeId,
    deleted_at: null,
    deleted_by: null,
  }));

  const cutJobParts = seed.cutParts.map<LocalRow>((part, index) => {
    const job = cutJobs.find((row) => row.id === part.cutJobId);
    return {
      id: part.id,
      profile_id: scopeId,
      cut_job_id: part.cutJobId,
      pieza: part.pieza,
      cantidad: normalizeNumber(part.cantidad, 1),
      largo_mm: normalizeNumber(part.largo),
      ancho_mm: normalizeNumber(part.ancho),
      material_id: part.materialId,
      espesor_mm: normalizeNumber(part.espesor),
      rotacion_permitida: Boolean(part.rotacionPermitida),
      veta_obligatoria: Boolean(part.vetaObligatoria),
      canto: normalizeNullableString(part.canto),
      prioridad: index + 1,
      observacion: normalizeNullableString(part.observacion),
      bloqueada: Boolean(part.bloqueada),
      created_at: job?.updated_at ?? settingsUpdatedAt,
      updated_at: job?.updated_at ?? settingsUpdatedAt,
      created_by: scopeId,
      updated_by: scopeId,
      deleted_at: null,
      deleted_by: null,
    };
  });

  const cutJobLayouts = seed.cutLayouts.map<LocalRow>((layout) => ({
    id: layout.id,
    profile_id: scopeId,
    cut_job_id: layout.cutJobId,
    iteration: layout.iteration,
    board_index: layout.layouts[0]?.boardIndex ?? 1,
    board_label: layout.layouts[0] ? `Placa ${layout.layouts[0].boardIndex}` : null,
    material_id: layout.layouts[0]?.materialId ?? null,
    espesor_mm: layout.layouts[0]?.espesor ?? null,
    largo_placa_mm: layout.layouts[0]?.height ?? 0,
    ancho_placa_mm: layout.layouts[0]?.width ?? 0,
    area_util_mm2: 0,
    area_usada_mm2: 0,
    area_desperdicio_mm2: 0,
    aprovechamiento_pct: layout.utilizedPct,
    costo_placa_snapshot: layout.totalBoardCost,
    kerf_mm: seed.settings.kerfSierraMm,
    margen_perimetral_mm: seed.settings.margenPerimetralPlacaMm,
    placements_json: [],
    offcuts_json: [],
    svg_layout: null,
    created_at: layout.createdAt,
    updated_at: layout.createdAt,
    created_by: scopeId,
    updated_by: scopeId,
  }));

  const budgets = seed.budgets.map<LocalRow>((budget) => ({
    id: budget.id,
    profile_id: scopeId,
    client_id: budget.clientId,
    custom_project_id: budget.projectId,
    ecommerce_product_id: budget.ecommerceProductId,
    budget_number: `PRES-${budget.id.slice(0, 8).toUpperCase()}`,
    fecha_emision: budget.fecha,
    fecha_validez: addDays(budget.fecha, budget.validezDias),
    forma_pago: normalizeNullableString(budget.formaPago),
    estado: mapLegacyBudgetStatus(budget.status),
    moneda: "ARS",
    subtotal_snapshot: normalizeNumber(
      budget.lineas.reduce((total, line) => total + normalizeNumber(line.monto), 0),
    ),
    descuento_snapshot: 0,
    impuestos_snapshot: 0,
    total_snapshot: normalizeNumber(budget.total),
    sena_snapshot: normalizeNumber(budget.sena),
    saldo_snapshot: normalizeNumber(budget.saldo),
    costs_snapshot: {
      version: 1,
      source: budget.projectId ? "custom_project" : budget.ecommerceProductId ? "ecommerce_product" : "manual",
      source_label: budget.projectId ? projectNameById.get(budget.projectId) ?? null : null,
      source_cost_total: normalizeNumber(budget.snapshot.resumen.costoTotal),
      source_cost_snapshot: budget.snapshot as unknown as Json,
    } satisfies Record<string, unknown>,
    pricing_snapshot: null,
    terms_snapshot: {
      version: 1,
      notes: null,
      payment_method: normalizeNullableString(budget.formaPago),
      valid_until: addDays(budget.fecha, budget.validezDias),
      whatsapp_text: null,
    } satisfies Record<string, unknown>,
    locked_at: null,
    created_at: budget.createdAt,
    updated_at: budget.createdAt,
    created_by: scopeId,
    updated_by: scopeId,
    deleted_at: null,
    deleted_by: null,
  }));

  const budgetItems = seed.budgets.flatMap<LocalRow>((budget) =>
    budget.lineas.map((line, index) => ({
      id: line.id,
      profile_id: scopeId,
      budget_id: budget.id,
      line_order: index + 1,
      concepto: line.concepto,
      descripcion: line.descripcion,
      cantidad: 1,
      precio_unitario_snapshot: normalizeNumber(line.monto),
      descuento_pct_snapshot: 0,
      impuestos_pct_snapshot: 0,
      subtotal_snapshot: normalizeNumber(line.monto),
      total_snapshot: normalizeNumber(line.monto),
      created_at: budget.createdAt,
      updated_at: budget.createdAt,
      created_by: scopeId,
      updated_by: scopeId,
    })),
  );

  const purchases = seed.purchases.map<LocalRow>((purchase) => ({
    id: purchase.id,
    profile_id: scopeId,
    source_type:
      purchase.origen === "proyecto"
        ? "custom_project"
        : purchase.origen === "corte"
          ? "cut_job"
          : "manual",
    source_id: purchase.referenceId,
    supplier_id: null,
    fecha_emision: purchase.fecha,
    fecha_entrega_estimada: null,
    status: mapLegacyPurchaseStatus(purchase.status),
    moneda: "ARS",
    subtotal_snapshot: normalizeNumber(purchase.total),
    impuestos_snapshot: 0,
    total_snapshot: normalizeNumber(purchase.total),
    notas: null,
    created_at: purchase.createdAt,
    updated_at: purchase.createdAt,
    created_by: scopeId,
    updated_by: scopeId,
    deleted_at: null,
    deleted_by: null,
  }));

  const purchaseItems = seed.purchaseItems.map<LocalRow>((item) => {
    const material = materialById.get(item.materialId);
    const purchase = purchases.find((row) => row.id === item.purchaseId);
    const received = item.comprado ? normalizeNumber(item.cantidad) : 0;

    return {
      id: item.id,
      profile_id: scopeId,
      purchase_id: item.purchaseId,
      material_id: item.materialId,
      supplier_id: item.proveedorId,
      descripcion_snapshot: material?.nombre ?? item.materialId,
      cantidad: normalizeNumber(item.cantidad),
      unidad_snapshot: item.unidad,
      costo_unitario_snapshot: normalizeNumber(item.costoUnitarioSnapshot),
      subtotal_snapshot: normalizeNumber(item.subtotal),
      cantidad_recibida: received,
      estado: received >= normalizeNumber(item.cantidad) ? "purchased" : "pending",
      created_at: String(purchase?.created_at ?? settingsUpdatedAt),
      updated_at: String(purchase?.updated_at ?? settingsUpdatedAt),
      created_by: scopeId,
      updated_by: scopeId,
      deleted_at: null,
      deleted_by: null,
    };
  });

  const jobsBoard = seed.jobsBoard.map<LocalRow>((job) => ({
    id: job.id,
    profile_id: scopeId,
    custom_project_id: job.projectId,
    budget_id: job.budgetId,
    client_id: job.clientId,
    titulo: job.nombreProyecto,
    estado: job.estado,
    monto_snapshot: normalizeNumber(job.monto),
    sena_snapshot: normalizeNumber(job.sena),
    saldo_snapshot: normalizeNumber(job.saldo),
    fecha_prometida: normalizeNullableString(job.fechaPrometida),
    fecha_inicio: null,
    fecha_entrega: null,
    avance_pct: normalizeNumber(job.avance),
    prioridad: 3,
    notas: null,
    created_at: job.updatedAt,
    updated_at: job.updatedAt,
    created_by: scopeId,
    updated_by: scopeId,
    deleted_at: null,
    deleted_by: null,
  }));

  return {
    version: STORAGE_VERSION,
    tables: {
      profiles: [profileRow],
      settings: [settingsRow],
      clients,
      suppliers,
      materials,
      material_price_history: materialPriceHistory,
      custom_projects: customProjects,
      custom_project_materials: customProjectMaterials,
      custom_project_labor: customProjectLabor,
      ecommerce_products: ecommerceProducts,
      ecommerce_product_materials: ecommerceProductMaterials,
      ecommerce_product_processes: ecommerceProductProcesses,
      cut_jobs: cutJobs,
      cut_job_parts: cutJobParts,
      cut_job_layouts: cutJobLayouts,
      purchases,
      purchase_items: purchaseItems,
      budgets,
      budget_items: budgetItems,
      jobs_board: jobsBoard,
      attachments: [],
    },
  };
}

function loadDatabase(scopeId: string) {
  const memory = memoryCache.get(scopeId);
  if (memory) {
    return memory;
  }

  if (canUseStorage()) {
    try {
      const raw = window.localStorage.getItem(buildStorageKey(scopeId));
      if (raw) {
        const parsed = JSON.parse(raw) as LocalDatabaseState;
        if (parsed.version === STORAGE_VERSION) {
          memoryCache.set(scopeId, parsed);
          return parsed;
        }
      }
    } catch {
      // Ignore corrupted local state and recreate from seed.
    }
  }

  const fresh = buildSeedDatabase(scopeId);
  memoryCache.set(scopeId, fresh);
  persistDatabase(scopeId, fresh);
  return fresh;
}

function persistDatabase(scopeId: string, database: LocalDatabaseState) {
  memoryCache.set(scopeId, database);
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(buildStorageKey(scopeId), JSON.stringify(database));
  } catch {
    // Ignore storage quota errors in development.
  }
}

function resolveScopeId(state: QueryState) {
  for (const filter of state.filters) {
    if (filter.kind === "eq" && filter.column === "profile_id" && typeof filter.value === "string") {
      return filter.value;
    }
  }

  const payload = state.payload;
  if (payload && !Array.isArray(payload) && typeof payload === "object") {
    const row = payload as LocalRow;
    if (typeof row.profile_id === "string") {
      return row.profile_id;
    }
    if (state.table === "profiles" && typeof row.id === "string") {
      return row.id;
    }
  }

  if (Array.isArray(payload)) {
    for (const item of payload) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const row = item as LocalRow;
      if (typeof row.profile_id === "string") {
        return row.profile_id;
      }
      if (state.table === "profiles" && typeof row.id === "string") {
        return row.id;
      }
    }
  }

  return "default";
}

function buildPostgrestError(message: string, code = "LOCAL000"): PostgrestError {
  return {
    code,
    details: "",
    hint: "",
    message,
    name: "PostgrestError",
  };
}

function getComparableValue(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  return String(value).toLowerCase();
}

function compareValues(left: unknown, right: unknown) {
  const a = getComparableValue(left);
  const b = getComparableValue(right);

  if (a === b) {
    return 0;
  }

  if (a === null) {
    return 1;
  }

  if (b === null) {
    return -1;
  }

  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }

  if (typeof a === "boolean" && typeof b === "boolean") {
    return Number(a) - Number(b);
  }

  return String(a).localeCompare(String(b));
}

function matchesEq(row: LocalRow, column: string, value: unknown) {
  return row[column] === value;
}

function matchesIn(row: LocalRow, column: string, values: unknown[]) {
  return values.includes(row[column]);
}

function matchesIlike(row: LocalRow, column: string, value: string) {
  const haystack = String(row[column] ?? "").toLowerCase();
  const needle = value.replace(/^%|%$/g, "").toLowerCase();
  return haystack.includes(needle);
}

function matchesOr(row: LocalRow, query: string) {
  return query
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .some((expression) => {
      const parts = expression.split(".");
      if (parts.length < 3) {
        return false;
      }

      const [column, operator, ...valueParts] = parts;
      const rawValue = valueParts.join(".");

      if (operator === "ilike") {
        return matchesIlike(row, column, rawValue);
      }

      if (operator === "eq") {
        return String(row[column] ?? "") === rawValue;
      }

      return false;
    });
}

function applyFilters(rows: LocalRow[], filters: QueryFilter[]) {
  return rows.filter((row) =>
    filters.every((filter) => {
      switch (filter.kind) {
        case "eq":
          return matchesEq(row, filter.column, filter.value);
        case "is":
          return row[filter.column] === filter.value;
        case "in":
          return matchesIn(row, filter.column, filter.values);
        case "or":
          return matchesOr(row, filter.query);
        default:
          return true;
      }
    }),
  );
}

function applyOrder(rows: LocalRow[], orders: QueryOrder[]) {
  if (orders.length === 0) {
    return rows;
  }

  return [...rows].sort((left, right) => {
    for (const order of orders) {
      const comparison = compareValues(left[order.column], right[order.column]);
      if (comparison !== 0) {
        return order.ascending ? comparison : -comparison;
      }
    }

    return 0;
  });
}

function parseSelectRelations(select: string | undefined) {
  if (!select) {
    return [];
  }

  const matches = select.matchAll(/(\w+):(\w+)\(([^()]*)\)/g);
  return Array.from(matches).map((match) => ({
    alias: match[1],
    relatedTable: match[2] as PublicTableName,
  }));
}

function hydrateRelations(database: LocalDatabaseState, table: PublicTableName, row: LocalRow, select?: string) {
  const hydrated = cloneValue(row);
  for (const relation of parseSelectRelations(select)) {
    const foreignKey =
      RELATION_FOREIGN_KEYS[table]?.[relation.relatedTable] ??
      `${relation.relatedTable.slice(0, -1)}_id`;
    const relatedId = hydrated[foreignKey];
    if (!relatedId) {
      hydrated[relation.alias] = null;
      continue;
    }

    hydrated[relation.alias] =
      database.tables[relation.relatedTable].find((candidate) => candidate.id === relatedId) ?? null;
  }

  return hydrated;
}

function applySelect(database: LocalDatabaseState, table: PublicTableName, rows: LocalRow[], select?: string) {
  return rows.map((row) => hydrateRelations(database, table, row, select));
}

function finalizeResult(
  database: LocalDatabaseState,
  state: QueryState,
  rows: LocalRow[],
): LocalQueryResult {
  const ordered = applyOrder(rows, state.orders);
  const limited = typeof state.limit === "number" ? ordered.slice(0, state.limit) : ordered;
  const selected = applySelect(database, state.table, limited, state.select);

  if (state.resultMode === "maybeSingle") {
    return {
      data: selected[0] ?? null,
      error: null,
    };
  }

  if (state.resultMode === "single") {
    if (selected.length !== 1) {
      return {
        data: null,
        error: buildPostgrestError("No se encontro un unico registro.", "PGRST116"),
      };
    }

    return {
      data: selected[0],
      error: null,
    };
  }

  return {
    data: selected,
    error: null,
  };
}

function ensureInsertDefaults(table: PublicTableName, payload: LocalRow) {
  const timestamp = nowIso();
  const profileId =
    typeof payload.profile_id === "string"
      ? payload.profile_id
      : table === "profiles" && typeof payload.id === "string"
        ? payload.id
        : null;

  const base: LocalRow = {
    ...payload,
    id: typeof payload.id === "string" && payload.id ? payload.id : createId(),
    created_at: payload.created_at ?? timestamp,
    updated_at: payload.updated_at ?? timestamp,
  };

  if (profileId && base.created_by === undefined) {
    base.created_by = profileId;
  }

  if (profileId && base.updated_by === undefined) {
    base.updated_by = profileId;
  }

  if (base.deleted_at === undefined) {
    base.deleted_at = null;
  }

  if (base.deleted_by === undefined) {
    base.deleted_by = null;
  }

  if (table === "settings") {
    base.is_active = base.is_active ?? true;
    base.notes = base.notes ?? null;
  }

  if (table === "cut_jobs") {
    base.iteration_actual = base.iteration_actual ?? 1;
    base.placas_necesarias_snapshot = base.placas_necesarias_snapshot ?? 0;
    base.aprovechamiento_pct_snapshot = base.aprovechamiento_pct_snapshot ?? 0;
    base.desperdicio_pct_snapshot = base.desperdicio_pct_snapshot ?? 0;
    base.costo_placas_snapshot = base.costo_placas_snapshot ?? 0;
    base.status = base.status ?? "draft";
  }

  return base;
}

function getPayloadRows(state: QueryState) {
  if (state.operation === "delete") {
    return [];
  }

  if (!state.payload) {
    return [];
  }

  if (Array.isArray(state.payload)) {
    return state.payload.filter((item): item is LocalRow => Boolean(item) && typeof item === "object");
  }

  if (typeof state.payload === "object") {
    return [state.payload as LocalRow];
  }

  return [];
}

function applyUpdate(row: LocalRow, patch: LocalRow) {
  const next: LocalRow = {
    ...row,
    ...patch,
    updated_at: patch.updated_at ?? nowIso(),
  };

  if (patch.deleted_at === undefined && row.deleted_at !== undefined) {
    next.deleted_at = row.deleted_at;
  }

  if (patch.deleted_by === undefined && row.deleted_by !== undefined) {
    next.deleted_by = row.deleted_by;
  }

  return next;
}

function executeSelect(database: LocalDatabaseState, state: QueryState): LocalQueryResult {
  const filtered = applyFilters(database.tables[state.table], state.filters);
  return finalizeResult(database, state, filtered);
}

function executeInsert(database: LocalDatabaseState, state: QueryState, scopeId: string): LocalQueryResult {
  const rows = getPayloadRows(state).map((row) =>
    ensureInsertDefaults(state.table, {
      ...row,
      profile_id:
        row.profile_id ??
        (state.table === "profiles" ? row.id : scopeId !== "default" ? scopeId : row.profile_id),
    }),
  );
  database.tables[state.table].push(...rows);
  return state.select ? finalizeResult(database, state, rows) : { data: null, error: null };
}

function executeUpdate(database: LocalDatabaseState, state: QueryState): LocalQueryResult {
  const patch = getPayloadRows(state)[0] ?? {};
  const updated: LocalRow[] = [];

  database.tables[state.table] = database.tables[state.table].map((row) => {
    if (!applyFilters([row], state.filters).length) {
      return row;
    }

    const next = applyUpdate(row, patch);
    updated.push(next);
    return next;
  });

  return state.select ? finalizeResult(database, state, updated) : { data: null, error: null };
}

function executeDelete(database: LocalDatabaseState, state: QueryState): LocalQueryResult {
  const toDelete = applyFilters(database.tables[state.table], state.filters);
  const deletedIds = new Set(toDelete.map((row) => row.id));
  database.tables[state.table] = database.tables[state.table].filter((row) => !deletedIds.has(row.id));
  return state.select ? finalizeResult(database, state, toDelete) : { data: null, error: null };
}

function executeUpsert(database: LocalDatabaseState, state: QueryState, scopeId: string): LocalQueryResult {
  const rows = getPayloadRows(state);
  const conflictColumn = state.options?.onConflict ?? "id";
  const affected: LocalRow[] = [];

  for (const row of rows) {
    const normalized = ensureInsertDefaults(state.table, {
      ...row,
      profile_id:
        row.profile_id ??
        (state.table === "profiles" ? row.id : scopeId !== "default" ? scopeId : row.profile_id),
    });
    const conflictValue = normalized[conflictColumn];
    const existingIndex = database.tables[state.table].findIndex(
      (candidate) => candidate[conflictColumn] === conflictValue,
    );

    if (existingIndex >= 0) {
      const next = applyUpdate(database.tables[state.table][existingIndex], normalized);
      database.tables[state.table][existingIndex] = next;
      affected.push(next);
    } else {
      database.tables[state.table].push(normalized);
      affected.push(normalized);
    }
  }

  return state.select ? finalizeResult(database, state, affected) : { data: null, error: null };
}

export function executeLocalQuery(state: QueryState): LocalQueryResult {
  const scopeId = resolveScopeId(state);
  const database = cloneValue(loadDatabase(scopeId));

  const result =
    state.operation === "select"
      ? executeSelect(database, state)
      : state.operation === "insert"
        ? executeInsert(database, state, scopeId)
        : state.operation === "update"
          ? executeUpdate(database, state)
          : state.operation === "delete"
            ? executeDelete(database, state)
            : executeUpsert(database, state, scopeId);

  persistDatabase(scopeId, database);
  return result;
}

export function shouldFallbackToLocal(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as Partial<PostgrestError> & { status?: number };
  return (
    candidate.code === LOCAL_ERROR_CODE ||
    candidate.status === 404 ||
    candidate.message?.includes("schema cache") === true ||
    candidate.message?.includes("Could not find the table") === true
  );
}
