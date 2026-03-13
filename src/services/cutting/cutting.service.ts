import type { Json, TableInsert, TableRow, TableUpdate } from "@/types";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  buildCuttingLayoutSvg,
  optimizeCuttingJob,
  type CuttingBoardLayout,
  type CuttingMaterialContext,
  type CuttingOptimizationResult,
  type CuttingPartInput,
} from "@/domain/cutting";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/services/supabase/browser-client";

const CUT_JOBS_TABLE = "cut_jobs" as const;
const CUT_JOB_PARTS_TABLE = "cut_job_parts" as const;
const CUT_JOB_LAYOUTS_TABLE = "cut_job_layouts" as const;
const MATERIALS_TABLE = "materials" as const;

const CUT_JOB_PARTS_SELECT = "*, material:materials(id, codigo, nombre, unidad, costo_unitario, area_m2, largo_mm, ancho_mm, espesor_mm, activo)";

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

interface CutJobsListQuery {
  eq: (column: string, value: string | boolean) => CutJobsListQuery;
  is: (column: string, value: null) => CutJobsListQuery;
  or: (query: string) => CutJobsListQuery;
  order: (
    column: string,
    options?: { ascending?: boolean },
  ) => Promise<QueryResponse<CutJobRecord[]>>;
}

interface CutJobByIdQuery {
  is: (column: string, value: null) => CutJobByIdQuery;
  maybeSingle: () => Promise<QueryResponse<CutJobRecord>>;
}

type CutJobRecord = TableRow<typeof CUT_JOBS_TABLE>;
type CutJobInsert = TableInsert<typeof CUT_JOBS_TABLE>;
type CutJobUpdate = TableUpdate<typeof CUT_JOBS_TABLE>;
type CutJobPartRecord = TableRow<typeof CUT_JOB_PARTS_TABLE>;
type CutJobPartInsert = TableInsert<typeof CUT_JOB_PARTS_TABLE>;
type CutJobLayoutRecordRaw = TableRow<typeof CUT_JOB_LAYOUTS_TABLE>;
type CutJobLayoutInsert = TableInsert<typeof CUT_JOB_LAYOUTS_TABLE>;
type MaterialRecord = Pick<
  TableRow<typeof MATERIALS_TABLE>,
  "id" | "codigo" | "nombre" | "unidad" | "costo_unitario" | "area_m2" | "largo_mm" | "ancho_mm" | "espesor_mm"
>;

interface CutJobPartWithMaterial extends CutJobPartRecord {
  material: MaterialRecord | null;
}

export const CUT_JOB_STATUS_OPTIONS = ["draft", "optimized", "archived"] as const;

export type CutJobStatusValue = (typeof CUT_JOB_STATUS_OPTIONS)[number];

export const CUT_JOB_STATUS_LABELS: Record<CutJobStatusValue, string> = {
  draft: "Borrador",
  optimized: "Optimizado",
  archived: "Archivado",
};

export interface CuttingJobsListFilters {
  search?: string;
  status?: string;
  include_deleted?: boolean;
}

export interface CuttingJobDraftInput {
  id?: string;
  nombre: string;
  largo_placa_mm: number;
  ancho_placa_mm: number;
  kerf_mm: number;
  margen_perimetral_mm: number;
  desperdicio_extra_pct: number;
  permitir_rotacion_default: boolean;
  veta_default: boolean;
  status?: string;
}

export interface CuttingPartDraftInput {
  id?: string;
  pieza: string;
  cantidad: number;
  largo_mm: number;
  ancho_mm: number;
  material_id: string;
  espesor_mm: number | null;
  rotacion_permitida: boolean;
  veta_obligatoria: boolean;
  canto: string;
  prioridad: number;
  observacion: string;
  bloqueada: boolean;
}

export interface CuttingBundleMutationInput {
  job: CuttingJobDraftInput;
  parts: CuttingPartDraftInput[];
}

export interface CuttingOptimizeMutationInput extends CuttingBundleMutationInput {
  iteration?: number;
}

export interface CuttingLayoutRecord extends Omit<CutJobLayoutRecordRaw, "placements_json" | "offcuts_json"> {
  placements: CuttingBoardLayout["placements"];
  offcuts: CuttingBoardLayout["offcuts"];
}

export interface CuttingDetailRecord {
  job: CutJobRecord;
  parts: CutJobPartWithMaterial[];
  layouts: CuttingLayoutRecord[];
  result: CuttingOptimizationResult | null;
  layoutSvg: string | null;
}

export interface CuttingOptimizationRecord {
  detail: CuttingDetailRecord;
  result: CuttingOptimizationResult;
  layoutSvg: string;
}

function normalizeString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeNonNegative(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function normalizeNullableNonNegative(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, value);
}

function normalizePositiveInt(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function normalizeStatus(value: string | null | undefined): CutJobStatusValue {
  const normalized = value?.trim().toLowerCase() ?? "";
  return CUT_JOB_STATUS_OPTIONS.includes(normalized as CutJobStatusValue)
    ? (normalized as CutJobStatusValue)
    : "draft";
}

function parseJsonArray<T>(value: Json | null | undefined): T[] {
  if (!value || !Array.isArray(value)) {
    return [];
  }

  return value as unknown as T[];
}

function mapLayoutRow(row: CutJobLayoutRecordRaw): CuttingLayoutRecord {
  return {
    ...row,
    placements: parseJsonArray<CuttingBoardLayout["placements"][number]>(row.placements_json),
    offcuts: parseJsonArray<CuttingBoardLayout["offcuts"][number]>(row.offcuts_json),
  };
}

function mapJobToParams(job: CutJobRecord) {
  return {
    largoPlacaMm: normalizeNonNegative(job.largo_placa_mm),
    anchoPlacaMm: normalizeNonNegative(job.ancho_placa_mm),
    kerfMm: normalizeNonNegative(job.kerf_mm),
    margenPerimetralMm: normalizeNonNegative(job.margen_perimetral_mm),
    desperdicioExtraPct: normalizeNonNegative(job.desperdicio_extra_pct),
    permitirRotacionDefault: Boolean(job.allow_rotation_default),
    vetaDefault: Boolean(job.grain_required_default),
  };
}

function mapPartToDomainInput(part: CutJobPartWithMaterial): CuttingPartInput {
  return {
    id: part.id,
    nombrePieza: part.pieza,
    cantidad: normalizePositiveInt(part.cantidad),
    largoMm: normalizeNonNegative(part.largo_mm),
    anchoMm: normalizeNonNegative(part.ancho_mm),
    materialId: part.material_id || "",
    espesorMm: normalizeNullableNonNegative(part.espesor_mm),
    rotacionPermitida: Boolean(part.rotacion_permitida),
    vetaObligatoria: Boolean(part.veta_obligatoria),
    cantoRequerido: part.canto || "",
    prioridad: normalizePositiveInt(part.prioridad),
    observacion: part.observacion || "",
    bloqueada: Boolean(part.bloqueada),
  };
}

function mapMaterialToDomainInput(material: MaterialRecord): CuttingMaterialContext {
  return {
    id: material.id,
    codigo: material.codigo,
    nombre: material.nombre,
    unidad: material.unidad,
    costoUnitario: normalizeNonNegative(material.costo_unitario),
    areaM2: normalizeNullableNonNegative(material.area_m2),
    largoMm: normalizeNullableNonNegative(material.largo_mm),
    anchoMm: normalizeNullableNonNegative(material.ancho_mm),
    espesorMm: normalizeNullableNonNegative(material.espesor_mm),
  };
}

function buildResultFromLayouts(
  job: CutJobRecord,
  layouts: CuttingLayoutRecord[],
): CuttingOptimizationResult | null {
  if (layouts.length === 0) {
    return null;
  }

  const params = mapJobToParams(job);
  const totalAreaUtilMm2 = layouts.reduce((acc, board) => acc + Number(board.area_util_mm2 || 0), 0);
  const totalAreaUsadaMm2 = layouts.reduce((acc, board) => acc + Number(board.area_usada_mm2 || 0), 0);

  return {
    iteration: layouts[0]?.iteration ?? job.iteration_actual,
    params,
    boards: layouts.map((layout) => ({
      boardKey: `${layout.cut_job_id}:${layout.iteration}:${layout.board_index}`,
      boardIndex: layout.board_index,
      boardLabel: layout.board_label || `Placa ${layout.board_index}`,
      materialId: layout.material_id || "",
      espesorMm: normalizeNullableNonNegative(layout.espesor_mm),
      largoPlacaMm: normalizeNonNegative(layout.largo_placa_mm),
      anchoPlacaMm: normalizeNonNegative(layout.ancho_placa_mm),
      areaUtilMm2: normalizeNonNegative(layout.area_util_mm2),
      areaUsadaMm2: normalizeNonNegative(layout.area_usada_mm2),
      areaDesperdicioMm2: normalizeNonNegative(layout.area_desperdicio_mm2),
      aprovechamientoPct: normalizeNonNegative(layout.aprovechamiento_pct),
      costoPlaca: normalizeNonNegative(layout.costo_placa_snapshot),
      placements: layout.placements,
      offcuts: layout.offcuts,
    })),
    unplaced: [],
    summary: {
      boardsUsed: layouts.length,
      totalAreaUtilMm2,
      totalAreaUsadaMm2,
      totalAreaDesperdicioMm2: Math.max(totalAreaUtilMm2 - totalAreaUsadaMm2, 0),
      aprovechamientoPct: normalizeNonNegative(job.aprovechamiento_pct_snapshot),
      desperdicioPct: normalizeNonNegative(job.desperdicio_pct_snapshot),
      costoPlacas: normalizeNonNegative(job.costo_placas_snapshot),
      totalCantoMetros: layouts.reduce(
        (acc, board) =>
          acc +
          board.placements.reduce(
            (sum, placement) => sum + normalizeNonNegative(placement.cantoMetros),
            0,
          ),
        0,
      ),
      piezasTotales: layouts.reduce((acc, board) => acc + board.placements.length, 0),
      piezasUbicadas: layouts.reduce((acc, board) => acc + board.placements.length, 0),
      piezasSinUbicar: 0,
    },
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

async function getJobByIdWithContext(
  context: AuthorizedContext,
  jobId: string,
  includeDeleted = true,
): Promise<CutJobRecord | null> {
  let query = context.client
    .from(CUT_JOBS_TABLE as never)
    .select("*")
    .eq("id", jobId)
    .eq("profile_id", context.userId) as unknown as CutJobByIdQuery;

  if (!includeDeleted) {
    query = query.is("deleted_at", null);
  }

  const response = (await query.maybeSingle()) as QueryResponse<CutJobRecord>;
  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data;
}

async function getPartsWithContext(
  context: AuthorizedContext,
  jobId: string,
): Promise<CutJobPartWithMaterial[]> {
  const response = (await context.client
    .from(CUT_JOB_PARTS_TABLE as never)
    .select(CUT_JOB_PARTS_SELECT)
    .eq("profile_id", context.userId)
    .eq("cut_job_id", jobId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })) as QueryResponse<CutJobPartWithMaterial[]>;

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data ?? [];
}

async function getLayoutsWithContext(
  context: AuthorizedContext,
  jobId: string,
): Promise<CuttingLayoutRecord[]> {
  const response = (await context.client
    .from(CUT_JOB_LAYOUTS_TABLE as never)
    .select("*")
    .eq("profile_id", context.userId)
    .eq("cut_job_id", jobId)
    .order("iteration", { ascending: false })
    .order("board_index", { ascending: true })) as QueryResponse<CutJobLayoutRecordRaw[]>;

  if (response.error) {
    throw new Error(response.error.message);
  }

  const rows = response.data ?? [];
  if (rows.length === 0) {
    return [];
  }

  const latestIteration = rows[0].iteration;
  return rows
    .filter((row) => row.iteration === latestIteration)
    .map(mapLayoutRow);
}

async function getMaterialsMapWithContext(
  context: AuthorizedContext,
  materialIds: string[],
): Promise<Map<string, MaterialRecord>> {
  if (materialIds.length === 0) {
    return new Map();
  }

  const response = (await context.client
    .from(MATERIALS_TABLE as never)
    .select("id, codigo, nombre, unidad, costo_unitario, area_m2, largo_mm, ancho_mm, espesor_mm")
    .eq("profile_id", context.userId)
    .in("id", materialIds)
    .is("deleted_at", null)) as QueryResponse<MaterialRecord[]>;

  if (response.error) {
    throw new Error(response.error.message);
  }

  return new Map((response.data ?? []).map((material) => [material.id, material]));
}

function mapJobMutationPayload(input: CuttingJobDraftInput, userId: string): CutJobUpdate {
  return {
    nombre: normalizeString(input.nombre) || "Nuevo corte",
    largo_placa_mm: normalizeNonNegative(input.largo_placa_mm),
    ancho_placa_mm: normalizeNonNegative(input.ancho_placa_mm),
    kerf_mm: normalizeNonNegative(input.kerf_mm),
    margen_perimetral_mm: normalizeNonNegative(input.margen_perimetral_mm),
    desperdicio_extra_pct: normalizeNonNegative(input.desperdicio_extra_pct),
    allow_rotation_default: Boolean(input.permitir_rotacion_default),
    grain_required_default: Boolean(input.veta_default),
    status: normalizeStatus(input.status),
    updated_by: userId,
    deleted_at: null,
    deleted_by: null,
  };
}

function mapPartMutationPayload(
  jobId: string,
  part: CuttingPartDraftInput,
  userId: string,
): CutJobPartInsert {
  return {
    id: part.id,
    profile_id: userId,
    cut_job_id: jobId,
    pieza: normalizeString(part.pieza) || "Pieza",
    cantidad: Math.max(1, normalizePositiveInt(part.cantidad)),
    largo_mm: normalizeNonNegative(part.largo_mm),
    ancho_mm: normalizeNonNegative(part.ancho_mm),
    material_id: normalizeString(part.material_id),
    espesor_mm: normalizeNullableNonNegative(part.espesor_mm),
    rotacion_permitida: Boolean(part.rotacion_permitida),
    veta_obligatoria: Boolean(part.veta_obligatoria),
    canto: normalizeString(part.canto),
    prioridad: Math.max(1, Math.min(9, normalizePositiveInt(part.prioridad) || 3)),
    observacion: normalizeString(part.observacion),
    bloqueada: Boolean(part.bloqueada),
    created_by: userId,
    updated_by: userId,
    deleted_at: null,
    deleted_by: null,
  };
}

async function saveBundleWithContext(
  context: AuthorizedContext,
  input: CuttingBundleMutationInput,
): Promise<{ job: CutJobRecord; parts: CutJobPartWithMaterial[] }> {
  const jobPayload = mapJobMutationPayload(input.job, context.userId);

  const jobResponse = input.job.id
    ? ((await context.client
        .from(CUT_JOBS_TABLE as never)
        .update(jobPayload as never)
        .eq("id", input.job.id)
        .eq("profile_id", context.userId)
        .select("*")
        .single()) as QueryResponse<CutJobRecord>)
    : ((await context.client
        .from(CUT_JOBS_TABLE as never)
        .insert(
          {
            ...(jobPayload as CutJobInsert),
            profile_id: context.userId,
            created_by: context.userId,
          } as never,
        )
        .select("*")
        .single()) as QueryResponse<CutJobRecord>);

  if (jobResponse.error || !jobResponse.data) {
    throw new Error(jobResponse.error?.message || "No se pudo guardar el trabajo de corte.");
  }

  const jobId = jobResponse.data.id;

  const deletePartsResponse = (await context.client
    .from(CUT_JOB_PARTS_TABLE as never)
    .delete()
    .eq("profile_id", context.userId)
    .eq("cut_job_id", jobId)) as MutationResponse;

  if (deletePartsResponse.error) {
    throw new Error(deletePartsResponse.error.message);
  }

  const partRows = input.parts.map((part) => mapPartMutationPayload(jobId, part, context.userId));
  if (partRows.length > 0) {
    const insertPartsResponse = (await context.client
      .from(CUT_JOB_PARTS_TABLE as never)
      .insert(partRows as never)) as MutationResponse;

    if (insertPartsResponse.error) {
      throw new Error(insertPartsResponse.error.message);
    }
  }

  const parts = await getPartsWithContext(context, jobId);
  return {
    job: jobResponse.data,
    parts,
  };
}

async function persistLayoutsWithContext(
  context: AuthorizedContext,
  params: {
    jobId: string;
    iteration: number;
    result: CuttingOptimizationResult;
    layoutSvg: string;
  },
) {
  const deleteLayoutsResponse = (await context.client
    .from(CUT_JOB_LAYOUTS_TABLE as never)
    .delete()
    .eq("profile_id", context.userId)
    .eq("cut_job_id", params.jobId)
    .eq("iteration", params.iteration)) as MutationResponse;

  if (deleteLayoutsResponse.error) {
    throw new Error(deleteLayoutsResponse.error.message);
  }

  if (params.result.boards.length === 0) {
    return;
  }

  const rows: CutJobLayoutInsert[] = params.result.boards.map((board, index) => ({
    profile_id: context.userId,
    cut_job_id: params.jobId,
    iteration: params.iteration,
    board_index: board.boardIndex,
    board_label: board.boardLabel,
    material_id: board.materialId || null,
    espesor_mm: board.espesorMm,
    largo_placa_mm: board.largoPlacaMm,
    ancho_placa_mm: board.anchoPlacaMm,
    area_util_mm2: board.areaUtilMm2,
    area_usada_mm2: board.areaUsadaMm2,
    area_desperdicio_mm2: board.areaDesperdicioMm2,
    aprovechamiento_pct: board.aprovechamientoPct,
    costo_placa_snapshot: board.costoPlaca,
    kerf_mm: params.result.params.kerfMm,
    margen_perimetral_mm: params.result.params.margenPerimetralMm,
    placements_json: board.placements as unknown as Json,
    offcuts_json: board.offcuts as unknown as Json,
    svg_layout: index === 0 ? params.layoutSvg : null,
    created_by: context.userId,
    updated_by: context.userId,
  }));

  const insertLayoutsResponse = (await context.client
    .from(CUT_JOB_LAYOUTS_TABLE as never)
    .insert(rows as never)) as MutationResponse;

  if (insertLayoutsResponse.error) {
    throw new Error(insertLayoutsResponse.error.message);
  }
}

async function updateJobOptimizationSnapshotWithContext(
  context: AuthorizedContext,
  jobId: string,
  result: CuttingOptimizationResult,
) {
  const response = (await context.client
    .from(CUT_JOBS_TABLE as never)
    .update(
      {
        iteration_actual: result.iteration,
        placas_necesarias_snapshot: result.summary.boardsUsed,
        aprovechamiento_pct_snapshot: result.summary.aprovechamientoPct,
        desperdicio_pct_snapshot: result.summary.desperdicioPct,
        costo_placas_snapshot: result.summary.costoPlacas,
        status: "optimized",
        updated_by: context.userId,
      } as never,
    )
    .eq("id", jobId)
    .eq("profile_id", context.userId)) as MutationResponse;

  if (response.error) {
    throw new Error(response.error.message);
  }
}

export const cuttingService = {
  async list(filters: CuttingJobsListFilters = {}): Promise<CutJobRecord[]> {
    const context = await getAuthorizedContext();
    let query = context.client
      .from(CUT_JOBS_TABLE as never)
      .select("*") as unknown as CutJobsListQuery;
    query = query.eq("profile_id", context.userId);

    if (!filters.include_deleted) {
      query = query.is("deleted_at", null);
    }

    if (filters.search?.trim()) {
      const escaped = filters.search.trim().replace(/,/g, " ");
      query = query.or([`nombre.ilike.%${escaped}%`, `status.ilike.%${escaped}%`].join(","));
    }

    if (filters.status?.trim()) {
      query = query.eq("status", normalizeStatus(filters.status));
    }

    const response = (await query.order("updated_at", { ascending: false })) as QueryResponse<
      CutJobRecord[]
    >;
    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data ?? [];
  },

  async getById(jobId: string, includeDeleted = true): Promise<CutJobRecord | null> {
    const context = await getAuthorizedContext();
    return getJobByIdWithContext(context, jobId, includeDeleted);
  },

  async getDetail(jobId: string): Promise<CuttingDetailRecord | null> {
    const context = await getAuthorizedContext();
    const [job, parts, layouts] = await Promise.all([
      getJobByIdWithContext(context, jobId, true),
      getPartsWithContext(context, jobId),
      getLayoutsWithContext(context, jobId),
    ]);

    if (!job) {
      return null;
    }

    const layoutSvg = layouts.find((layout) => Boolean(layout.svg_layout))?.svg_layout ?? null;
    return {
      job,
      parts,
      layouts,
      result: buildResultFromLayouts(job, layouts),
      layoutSvg,
    };
  },

  async saveBundle(input: CuttingBundleMutationInput): Promise<CuttingDetailRecord> {
    const context = await getAuthorizedContext();
    const saved = await saveBundleWithContext(context, input);
    const layouts = await getLayoutsWithContext(context, saved.job.id);
    const layoutSvg = layouts.find((layout) => Boolean(layout.svg_layout))?.svg_layout ?? null;

    return {
      job: saved.job,
      parts: saved.parts,
      layouts,
      result: buildResultFromLayouts(saved.job, layouts),
      layoutSvg,
    };
  },

  async optimizeBundle(input: CuttingOptimizeMutationInput): Promise<CuttingOptimizationRecord> {
    const context = await getAuthorizedContext();
    const saved = await saveBundleWithContext(context, input);

    const materialIds = Array.from(
      new Set(saved.parts.map((part) => part.material_id).filter((materialId): materialId is string => Boolean(materialId))),
    );
    const materialMap = await getMaterialsMapWithContext(context, materialIds);

    const missingMaterial = saved.parts.find(
      (part) => part.material_id && !materialMap.has(part.material_id),
    );
    if (missingMaterial) {
      throw new Error("Una o mas piezas usan materiales inexistentes o archivados.");
    }

    const domainParts = saved.parts.map(mapPartToDomainInput);
    const domainMaterials = Array.from(materialMap.values()).map(mapMaterialToDomainInput);
    const iteration = input.iteration ?? Math.max(1, normalizePositiveInt(saved.job.iteration_actual) + 1);

    const result = optimizeCuttingJob({
      parts: domainParts,
      params: mapJobToParams(saved.job),
      materials: domainMaterials,
      iteration,
    });

    const materialContextMap = new Map(domainMaterials.map((material) => [material.id, material]));
    const layoutSvg = buildCuttingLayoutSvg(result, materialContextMap);

    await persistLayoutsWithContext(context, {
      jobId: saved.job.id,
      iteration: result.iteration,
      result,
      layoutSvg,
    });
    await updateJobOptimizationSnapshotWithContext(context, saved.job.id, result);

    const detail = await this.getDetail(saved.job.id);
    if (!detail) {
      throw new Error("No se pudo recuperar el trabajo de corte optimizado.");
    }

    return {
      detail,
      result,
      layoutSvg,
    };
  },

  async duplicate(jobId: string): Promise<CuttingDetailRecord> {
    const detail = await this.getDetail(jobId);
    if (!detail) {
      throw new Error("No se encontro el trabajo a duplicar.");
    }

    return this.saveBundle({
      job: {
        nombre: `${detail.job.nombre} (Copia)`,
        largo_placa_mm: detail.job.largo_placa_mm,
        ancho_placa_mm: detail.job.ancho_placa_mm,
        kerf_mm: detail.job.kerf_mm,
        margen_perimetral_mm: detail.job.margen_perimetral_mm,
        desperdicio_extra_pct: detail.job.desperdicio_extra_pct,
        permitir_rotacion_default: detail.job.allow_rotation_default,
        veta_default: detail.job.grain_required_default,
        status: "draft",
      },
      parts: detail.parts.map((part) => ({
        pieza: part.pieza,
        cantidad: part.cantidad,
        largo_mm: part.largo_mm,
        ancho_mm: part.ancho_mm,
        material_id: part.material_id || "",
        espesor_mm: part.espesor_mm,
        rotacion_permitida: part.rotacion_permitida,
        veta_obligatoria: part.veta_obligatoria,
        canto: part.canto || "",
        prioridad: part.prioridad,
        observacion: part.observacion || "",
        bloqueada: part.bloqueada,
      })),
    });
  },

  async softDelete(jobId: string): Promise<void> {
    const context = await getAuthorizedContext();
    const response = (await context.client
      .from(CUT_JOBS_TABLE as never)
      .update(
        {
          deleted_at: new Date().toISOString(),
          deleted_by: context.userId,
          status: "archived",
          updated_by: context.userId,
        } as never,
      )
      .eq("id", jobId)
      .eq("profile_id", context.userId)) as MutationResponse;

    if (response.error) {
      throw new Error(response.error.message);
    }
  },

  async restore(jobId: string): Promise<void> {
    const context = await getAuthorizedContext();
    const response = (await context.client
      .from(CUT_JOBS_TABLE as never)
      .update(
        {
          deleted_at: null,
          deleted_by: null,
          status: "draft",
          updated_by: context.userId,
        } as never,
      )
      .eq("id", jobId)
      .eq("profile_id", context.userId)) as MutationResponse;

    if (response.error) {
      throw new Error(response.error.message);
    }
  },
};

export type {
  CutJobRecord,
  CutJobPartWithMaterial as CutJobPartRecord,
  CutJobLayoutRecordRaw as CutJobLayoutRecord,
};

