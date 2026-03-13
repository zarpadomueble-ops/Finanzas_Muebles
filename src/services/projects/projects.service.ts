import type { Json, TableInsert, TableRow, TableUpdate } from "@/types";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  buildCustomProjectCostSnapshot,
  calculateCustomProjectCost,
  calculateRealMarginPct,
  type CostingGlobalSettingsInput,
  type CustomProjectCostSnapshot,
} from "@/domain/costing";
import { settingsService } from "@/services/settings";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/services/supabase/browser-client";

const PROJECTS_TABLE = "custom_projects" as const;
const PROJECT_MATERIALS_TABLE = "custom_project_materials" as const;
const PROJECT_LABOR_TABLE = "custom_project_labor" as const;
const MATERIALS_TABLE = "materials" as const;

const PROJECTS_SELECT = "*, client:clients(id, nombre)";
const PROJECT_MATERIALS_SELECT =
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

interface ProjectsListQuery {
  eq: (column: string, value: string | boolean) => ProjectsListQuery;
  is: (column: string, value: null) => ProjectsListQuery;
  or: (query: string) => ProjectsListQuery;
  order: (
    column: string,
    options?: { ascending?: boolean },
  ) => Promise<QueryResponse<ProjectRowWithClient[]>>;
}

interface ProjectByIdQuery {
  is: (column: string, value: null) => ProjectByIdQuery;
  maybeSingle: () => Promise<QueryResponse<ProjectRowWithClient>>;
}

export const PROJECT_STATUS_OPTIONS = [
  "draft",
  "pending",
  "approved",
  "in_progress",
  "completed",
  "cancelled",
] as const;

export const PROJECT_STATUS_LABELS: Record<(typeof PROJECT_STATUS_OPTIONS)[number], string> = {
  draft: "Borrador",
  pending: "Pendiente",
  approved: "Aprobado",
  in_progress: "En progreso",
  completed: "Completado",
  cancelled: "Cancelado",
};

export const PROJECT_PROCESS_OPTIONS = [
  "diseno",
  "corte",
  "enchapado",
  "perforado",
  "armado",
  "instalacion",
] as const;

export type ProjectStatusValue = (typeof PROJECT_STATUS_OPTIONS)[number];
export type ProjectProcessKey = (typeof PROJECT_PROCESS_OPTIONS)[number];

export const PROJECT_PROCESS_LABELS: Record<ProjectProcessKey, string> = {
  diseno: "Diseno",
  corte: "Corte",
  enchapado: "Enchapado",
  perforado: "Perforado",
  armado: "Armado",
  instalacion: "Instalacion",
};

type ProjectRow = TableRow<typeof PROJECTS_TABLE>;
type ProjectInsert = TableInsert<typeof PROJECTS_TABLE>;
type ProjectUpdate = TableUpdate<typeof PROJECTS_TABLE>;
type ProjectMaterialRow = TableRow<typeof PROJECT_MATERIALS_TABLE>;
type ProjectMaterialInsert = TableInsert<typeof PROJECT_MATERIALS_TABLE>;
type ProjectLaborRow = TableRow<typeof PROJECT_LABOR_TABLE>;
type ProjectLaborInsert = TableInsert<typeof PROJECT_LABOR_TABLE>;
type MaterialSourceRow = Pick<
  TableRow<typeof MATERIALS_TABLE>,
  "id" | "codigo" | "nombre" | "unidad" | "costo_unitario" | "espesor_mm"
>;

export interface ProjectClientPreview {
  id: string;
  nombre: string;
}

interface ProjectRowWithClient extends ProjectRow {
  client: ProjectClientPreview | null;
}

interface ProjectMaterialRowWithMaterial extends ProjectMaterialRow {
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

interface ProjectSnapshotEnvelope {
  version: number;
  metadata: {
    notas: string | null;
    precio_final_manual: number | null;
    precio_evaluado: number;
    margen_real_pct: number;
  };
  costing: CustomProjectCostSnapshot;
}

interface ParsedProjectSnapshot {
  notas: string | null;
  precio_final_manual: number | null;
  precio_evaluado: number | null;
  margen_real_pct: number | null;
  costing: CustomProjectCostSnapshot | null;
}

export interface ProjectRecord extends ProjectRowWithClient {
  notas: string | null;
  precio_final_manual: number | null;
  precio_evaluado: number;
  margen_real_pct: number;
  costing_snapshot: CustomProjectCostSnapshot | null;
}

export type ProjectMaterialRecord = ProjectMaterialRowWithMaterial;
export type ProjectLaborRecord = ProjectLaborRow;

export interface ProjectDetailRecord {
  project: ProjectRecord;
  materials: ProjectMaterialRecord[];
  labor: ProjectLaborRecord[];
}

export interface ProjectsListFilters {
  search?: string;
  status?: string;
  client_id?: string;
  include_deleted?: boolean;
}

export interface ProjectDraftInput {
  id?: string;
  client_id: string;
  nombre_proyecto: string;
  fecha: string;
  tipo_mueble: string;
  ancho_mm: number | null;
  alto_mm: number | null;
  profundidad_mm: number | null;
  cantidad: number;
  estado: ProjectStatusValue;
  notas: string;
  precio_final_manual: number | null;
}

export interface ProjectMaterialDraftInput {
  material_id: string;
  consumo: number;
  desperdicio_pct: number;
  costo_unitario: number;
}

export interface ProjectLaborDraftInput {
  proceso_key: ProjectProcessKey;
  proceso_nombre?: string;
  horas: number;
  costo_hora: number | null;
}

export interface ProjectBundleMutationInput {
  project: ProjectDraftInput;
  materials: ProjectMaterialDraftInput[];
  labor: ProjectLaborDraftInput[];
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

function normalizeNullableNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function normalizeStatus(value: string | null | undefined): ProjectStatusValue {
  const normalized = value?.trim().toLowerCase() ?? "";
  return PROJECT_STATUS_OPTIONS.includes(normalized as ProjectStatusValue)
    ? (normalized as ProjectStatusValue)
    : "draft";
}

function normalizeProcessKey(value: string): ProjectProcessKey {
  const normalized = value.trim().toLowerCase();
  return PROJECT_PROCESS_OPTIONS.includes(normalized as ProjectProcessKey)
    ? (normalized as ProjectProcessKey)
    : "diseno";
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

function parseProjectSnapshot(snapshot: Json | null | undefined): ParsedProjectSnapshot {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return {
      notas: null,
      precio_final_manual: null,
      precio_evaluado: null,
      margen_real_pct: null,
      costing: null,
    };
  }

  const envelope = snapshot as Partial<ProjectSnapshotEnvelope>;
  const metadata: Partial<ProjectSnapshotEnvelope["metadata"]> = envelope.metadata ?? {};

  return {
    notas: normalizeString(metadata.notas),
    precio_final_manual:
      typeof metadata.precio_final_manual === "number" && Number.isFinite(metadata.precio_final_manual)
        ? metadata.precio_final_manual
        : null,
    precio_evaluado:
      typeof metadata.precio_evaluado === "number" && Number.isFinite(metadata.precio_evaluado)
        ? metadata.precio_evaluado
        : null,
    margen_real_pct:
      typeof metadata.margen_real_pct === "number" && Number.isFinite(metadata.margen_real_pct)
        ? metadata.margen_real_pct
        : null,
    costing: (envelope.costing as CustomProjectCostSnapshot | undefined) ?? null,
  };
}

function mapProjectRecord(row: ProjectRowWithClient): ProjectRecord {
  const snapshot = parseProjectSnapshot(row.settings_snapshot);
  const precioEvaluado = snapshot.precio_evaluado ?? row.precio_sugerido;
  const margenRealPct =
    snapshot.margen_real_pct ?? calculateRealMarginPct(precioEvaluado, row.costo_total);

  return {
    ...row,
    status: normalizeStatus(row.status),
    notas: snapshot.notas,
    precio_final_manual: snapshot.precio_final_manual,
    precio_evaluado: precioEvaluado,
    margen_real_pct: margenRealPct,
    costing_snapshot: snapshot.costing,
  };
}

function buildProjectSnapshotEnvelope(params: {
  notes: string | null;
  finalManualPrice: number | null;
  costSnapshot: CustomProjectCostSnapshot;
  evaluatedPrice: number;
  realMarginPct: number;
}): Json {
  const envelope: ProjectSnapshotEnvelope = {
    version: 1,
    metadata: {
      notas: params.notes,
      precio_final_manual: params.finalManualPrice,
      precio_evaluado: params.evaluatedPrice,
      margen_real_pct: params.realMarginPct,
    },
    costing: params.costSnapshot,
  };

  return envelope as unknown as Json;
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

export const projectsService = {
  async list(filters: ProjectsListFilters = {}): Promise<ProjectRecord[]> {
    const { client, userId } = await getAuthorizedContext();

    let query = client
      .from(PROJECTS_TABLE as never)
      .select(PROJECTS_SELECT) as unknown as ProjectsListQuery;
    query = query.eq("profile_id", userId);

    if (!filters.include_deleted) {
      query = query.is("deleted_at", null);
    }

    if (filters.search?.trim()) {
      const escaped = filters.search.trim().replace(/,/g, " ");
      query = query.or(
        [
          `nombre_proyecto.ilike.%${escaped}%`,
          `tipo_mueble.ilike.%${escaped}%`,
          `status.ilike.%${escaped}%`,
        ].join(","),
      );
    }

    if (filters.client_id) {
      query = query.eq("client_id", filters.client_id);
    }

    if (filters.status) {
      query = query.eq("status", normalizeStatus(filters.status));
    }

    const response = (await query.order("updated_at", { ascending: false })) as QueryResponse<
      ProjectRowWithClient[]
    >;

    if (response.error) {
      throw new Error(response.error.message);
    }

    return (response.data ?? []).map(mapProjectRecord);
  },

  async getById(projectId: string, includeDeleted = true): Promise<ProjectRecord | null> {
    const { client, userId } = await getAuthorizedContext();

    let query = client
      .from(PROJECTS_TABLE as never)
      .select(PROJECTS_SELECT)
      .eq("id", projectId)
      .eq("profile_id", userId) as unknown as ProjectByIdQuery;

    if (!includeDeleted) {
      query = query.is("deleted_at", null);
    }

    const response = (await query.maybeSingle()) as QueryResponse<ProjectRowWithClient>;
    if (response.error) {
      throw new Error(response.error.message);
    }

    if (!response.data) {
      return null;
    }

    return mapProjectRecord(response.data);
  },

  async getMaterials(projectId: string): Promise<ProjectMaterialRecord[]> {
    const { client, userId } = await getAuthorizedContext();

    const response = (await client
      .from(PROJECT_MATERIALS_TABLE as never)
      .select(PROJECT_MATERIALS_SELECT)
      .eq("profile_id", userId)
      .eq("custom_project_id", projectId)
      .is("deleted_at", null)
      .order("created_at", { ascending: true })) as QueryResponse<ProjectMaterialRecord[]>;

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data ?? [];
  },

  async getLabor(projectId: string): Promise<ProjectLaborRecord[]> {
    const { client, userId } = await getAuthorizedContext();

    const response = (await client
      .from(PROJECT_LABOR_TABLE as never)
      .select("*")
      .eq("profile_id", userId)
      .eq("custom_project_id", projectId)
      .order("line_order", { ascending: true })) as QueryResponse<ProjectLaborRecord[]>;

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data ?? [];
  },

  async getDetail(projectId: string): Promise<ProjectDetailRecord | null> {
    const [project, materials, labor] = await Promise.all([
      this.getById(projectId, true),
      this.getMaterials(projectId),
      this.getLabor(projectId),
    ]);

    if (!project) {
      return null;
    }

    return {
      project,
      materials,
      labor,
    };
  },

  async saveBundle(input: ProjectBundleMutationInput): Promise<ProjectDetailRecord> {
    const context = await getAuthorizedContext();
    const settings = await settingsService.getCurrent();
    const costingSettings = mapSettingsToCostingInput(settings);

    const normalizedMaterials = input.materials.map((line) => ({
      material_id: line.material_id,
      consumo: normalizeNonNegative(line.consumo),
      desperdicio_pct: normalizeNonNegative(line.desperdicio_pct),
      costo_unitario: normalizeNonNegative(line.costo_unitario),
    }));

    const normalizedLabor = input.labor.map((line) => ({
      proceso_key: normalizeProcessKey(line.proceso_key),
      proceso_nombre: normalizeString(line.proceso_nombre),
      horas: normalizeNonNegative(line.horas),
      costo_hora: normalizeNullableNumber(line.costo_hora),
    }));

    const materialIds = Array.from(
      new Set(normalizedMaterials.map((line) => line.material_id).filter(Boolean)),
    );
    const materialSourceMap = await getMaterialSourceMap(context, materialIds);

    for (const line of normalizedMaterials) {
      if (!materialSourceMap.get(line.material_id)) {
        throw new Error("Uno o mas materiales del proyecto no existen o estan archivados.");
      }
    }

    const costInputMaterials = normalizedMaterials.map((line) => {
      const material = materialSourceMap.get(line.material_id)!;
      return {
        materialId: line.material_id,
        descripcion: material.nombre,
        quantity: line.consumo,
        unitCost: line.costo_unitario || Number(material.costo_unitario || 0),
        wastePct: line.desperdicio_pct,
      };
    });

    const costInputLabor = normalizedLabor.map((line) => ({
      processKey: line.proceso_key,
      processName:
        line.proceso_nombre || PROJECT_PROCESS_LABELS[line.proceso_key] || line.proceso_key,
      hours: line.horas,
      hourlyCost: line.costo_hora ?? settings.costo_hora_taller,
    }));

    const targetPrice = normalizeNullableNumber(input.project.precio_final_manual);

    const costResult = calculateCustomProjectCost({
      settings: costingSettings,
      materials: costInputMaterials,
      labor: costInputLabor,
      targetPrice,
      marginPct: costingSettings.margenMedidaPct,
      applyGlobalMaterialWaste: true,
      includeCommercialCharges: true,
    });

    const costSnapshot = buildCustomProjectCostSnapshot(
      {
        settings: costingSettings,
        materials: costInputMaterials,
        labor: costInputLabor,
        marginPct: costingSettings.margenMedidaPct,
        targetPrice,
        applyGlobalMaterialWaste: true,
        includeCommercialCharges: true,
      },
      costResult,
    );

    const projectPayload: ProjectUpdate = {
      client_id: input.project.client_id || null,
      nombre_proyecto: input.project.nombre_proyecto.trim(),
      fecha: input.project.fecha,
      tipo_mueble: normalizeString(input.project.tipo_mueble),
      ancho: normalizeNullableNumber(input.project.ancho_mm),
      alto: normalizeNullableNumber(input.project.alto_mm),
      profundidad: normalizeNullableNumber(input.project.profundidad_mm),
      cantidad: Math.max(1, Math.floor(normalizeNonNegative(input.project.cantidad))),
      descuento_pct: 0,
      subtotal_materiales: costResult.subtotalMateriales,
      horas_totales: costResult.horasTotales,
      costo_mano_obra: costResult.costoManoObra,
      costo_directo: costResult.costoDirecto,
      costo_total: costResult.costoTotal,
      precio_sugerido: costResult.precioSugerido,
      utilidad_estimada: costResult.utilidad,
      status: normalizeStatus(input.project.estado),
      settings_snapshot: buildProjectSnapshotEnvelope({
        notes: normalizeString(input.project.notas),
        finalManualPrice: targetPrice,
        costSnapshot,
        evaluatedPrice: costResult.precioEvaluado,
        realMarginPct: costResult.margenRealPct,
      }),
      updated_by: context.userId,
      deleted_at: null,
      deleted_by: null,
    };

    const projectResponse = input.project.id
      ? ((await context.client
          .from(PROJECTS_TABLE as never)
          .update(projectPayload as never)
          .eq("id", input.project.id)
          .eq("profile_id", context.userId)
          .select(PROJECTS_SELECT)
          .single()) as QueryResponse<ProjectRowWithClient>)
      : ((await context.client
          .from(PROJECTS_TABLE as never)
          .insert(
            {
              ...(projectPayload as ProjectInsert),
              profile_id: context.userId,
              created_by: context.userId,
            } as never,
          )
          .select(PROJECTS_SELECT)
          .single()) as QueryResponse<ProjectRowWithClient>);

    if (projectResponse.error || !projectResponse.data) {
      throw new Error(projectResponse.error?.message || "No se pudo guardar el proyecto.");
    }

    const projectId = projectResponse.data.id;

    const deleteMaterialsResponse = (await context.client
      .from(PROJECT_MATERIALS_TABLE as never)
      .delete()
      .eq("profile_id", context.userId)
      .eq("custom_project_id", projectId)) as MutationResponse;

    if (deleteMaterialsResponse.error) {
      throw new Error(deleteMaterialsResponse.error.message);
    }

    const deleteLaborResponse = (await context.client
      .from(PROJECT_LABOR_TABLE as never)
      .delete()
      .eq("profile_id", context.userId)
      .eq("custom_project_id", projectId)) as MutationResponse;

    if (deleteLaborResponse.error) {
      throw new Error(deleteLaborResponse.error.message);
    }

    const projectMaterialRows: ProjectMaterialInsert[] = normalizedMaterials.map((line, index) => {
      const source = materialSourceMap.get(line.material_id)!;
      const costLine = costResult.materials.lines[index];

      return {
        profile_id: context.userId,
        custom_project_id: projectId,
        material_id: source.id,
        material_codigo_snapshot: source.codigo,
        material_nombre_snapshot: source.nombre,
        unidad_snapshot: source.unidad,
        espesor_mm_snapshot: source.espesor_mm,
        consumo: line.consumo,
        desperdicio_pct: line.desperdicio_pct,
        costo_unitario_snapshot: costLine.unitCost,
        subtotal_snapshot: costLine.totalSubtotal,
        created_by: context.userId,
        updated_by: context.userId,
        deleted_at: null,
        deleted_by: null,
      };
    });

    if (projectMaterialRows.length > 0) {
      const insertMaterialsResponse = (await context.client
        .from(PROJECT_MATERIALS_TABLE as never)
        .insert(projectMaterialRows as never)) as MutationResponse;

      if (insertMaterialsResponse.error) {
        throw new Error(insertMaterialsResponse.error.message);
      }
    }

    const projectLaborRows: ProjectLaborInsert[] = normalizedLabor.map((line, index) => {
      const costLine = costResult.labor.lines[index];
      return {
        profile_id: context.userId,
        custom_project_id: projectId,
        proceso_key: line.proceso_key,
        proceso_nombre:
          line.proceso_nombre || PROJECT_PROCESS_LABELS[line.proceso_key] || line.proceso_key,
        horas: line.horas,
        costo_hora_snapshot: costLine.hourlyCost,
        subtotal_snapshot: costLine.subtotal,
        line_order: index + 1,
        created_by: context.userId,
        updated_by: context.userId,
      };
    });

    if (projectLaborRows.length > 0) {
      const insertLaborResponse = (await context.client
        .from(PROJECT_LABOR_TABLE as never)
        .insert(projectLaborRows as never)) as MutationResponse;

      if (insertLaborResponse.error) {
        throw new Error(insertLaborResponse.error.message);
      }
    }

    const detail = await this.getDetail(projectId);
    if (!detail) {
      throw new Error("No se pudo recuperar el detalle del proyecto guardado.");
    }

    return detail;
  },

  async duplicate(projectId: string): Promise<ProjectDetailRecord> {
    const detail = await this.getDetail(projectId);
    if (!detail) {
      throw new Error("No se encontro el proyecto a duplicar.");
    }

    const duplicated = await this.saveBundle({
      project: {
        id: undefined,
        client_id: detail.project.client_id || "",
        nombre_proyecto: `${detail.project.nombre_proyecto} (Copia)`,
        fecha: detail.project.fecha,
        tipo_mueble: detail.project.tipo_mueble || "",
        ancho_mm: detail.project.ancho,
        alto_mm: detail.project.alto,
        profundidad_mm: detail.project.profundidad,
        cantidad: detail.project.cantidad,
        estado: "draft",
        notas: detail.project.notas || "",
        precio_final_manual: detail.project.precio_final_manual,
      },
      materials: detail.materials.map((line) => ({
        material_id: line.material_id || "",
        consumo: line.consumo,
        desperdicio_pct: line.desperdicio_pct,
        costo_unitario: line.costo_unitario_snapshot,
      })),
      labor: detail.labor.map((line) => ({
        proceso_key: normalizeProcessKey(line.proceso_key),
        proceso_nombre: line.proceso_nombre,
        horas: line.horas,
        costo_hora: line.costo_hora_snapshot,
      })),
    });

    return duplicated;
  },

  async softDelete(projectId: string): Promise<void> {
    const { client, userId } = await getAuthorizedContext();

    const response = (await client
      .from(PROJECTS_TABLE as never)
      .update(
        {
          deleted_at: new Date().toISOString(),
          deleted_by: userId,
          updated_by: userId,
        } as never,
      )
      .eq("id", projectId)
      .eq("profile_id", userId)) as MutationResponse;

    if (response.error) {
      throw new Error(response.error.message);
    }
  },

  async restore(projectId: string): Promise<void> {
    const { client, userId } = await getAuthorizedContext();

    const response = (await client
      .from(PROJECTS_TABLE as never)
      .update(
        {
          deleted_at: null,
          deleted_by: null,
          updated_by: userId,
        } as never,
      )
      .eq("id", projectId)
      .eq("profile_id", userId)) as MutationResponse;

    if (response.error) {
      throw new Error(response.error.message);
    }
  },
};

