import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/services/supabase/browser-client";
import type { TableInsert, TableRow, TableUpdate } from "@/types";

const TABLE = "jobs_board" as const;
const JOBS_SELECT =
  "*, client:clients(id, nombre, telefono, email), project:custom_projects(id, client_id, nombre_proyecto, fecha, status), budget:budgets(id, client_id, custom_project_id, budget_number, estado, total_snapshot, sena_snapshot, saldo_snapshot, fecha_emision, fecha_validez)";

type QueryResponse<T> = {
  data: T | null;
  error: PostgrestError | null;
};

interface AuthorizedContext {
  client: SupabaseClient;
  userId: string;
}

type JobBoardRow = TableRow<typeof TABLE>;
type JobBoardInsert = TableInsert<typeof TABLE>;
type JobBoardUpdate = TableUpdate<typeof TABLE>;

interface JobBoardRowWithRelations extends JobBoardRow {
  client: JobBoardClientPreview | null;
  project: JobBoardProjectPreview | null;
  budget: JobBoardBudgetPreview | null;
}

export const JOB_BOARD_STATUS_OPTIONS = [
  "por_cotizar",
  "presupuestado",
  "aprobado",
  "en_produccion",
  "instalado",
  "entregado",
  "cobrado",
] as const;

export const JOB_BOARD_STATUS_LABELS: Record<(typeof JOB_BOARD_STATUS_OPTIONS)[number], string> = {
  por_cotizar: "Por cotizar",
  presupuestado: "Presupuestado",
  aprobado: "Aprobado",
  en_produccion: "En produccion",
  instalado: "Instalado",
  entregado: "Entregado",
  cobrado: "Cobrado",
};

export type JobBoardStatusValue = (typeof JOB_BOARD_STATUS_OPTIONS)[number];

export interface JobBoardClientPreview {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
}

export interface JobBoardProjectPreview {
  id: string;
  client_id: string | null;
  nombre_proyecto: string;
  fecha: string;
  status: string;
}

export interface JobBoardBudgetPreview {
  id: string;
  client_id: string | null;
  custom_project_id: string | null;
  budget_number: string | null;
  estado: string;
  total_snapshot: number;
  sena_snapshot: number;
  saldo_snapshot: number;
  fecha_emision: string;
  fecha_validez: string | null;
}

export interface JobBoardRecord extends JobBoardRowWithRelations {
  estado: JobBoardStatusValue;
}

export interface JobBoardDetailRecord {
  job: JobBoardRecord;
}

export interface JobsBoardListFilters {
  search?: string;
  status?: string;
  client_id?: string;
  include_deleted?: boolean;
}

export interface JobBoardMutationInput {
  client_id: string;
  custom_project_id: string | null;
  budget_id: string | null;
  titulo: string;
  estado: JobBoardStatusValue;
  monto_snapshot: number;
  sena_snapshot: number;
  saldo_snapshot: number;
  fecha_prometida: string | null;
  fecha_inicio: string | null;
  fecha_entrega: string | null;
  avance_pct: number;
  prioridad: number;
  notas: string;
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

function normalizeDate(value: string | null | undefined) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  return normalized.includes("T") ? normalized.slice(0, 10) : normalized;
}

function normalizeStatus(value: string | null | undefined): JobBoardStatusValue {
  const normalized = value?.trim().toLowerCase() ?? "";
  return JOB_BOARD_STATUS_OPTIONS.includes(normalized as JobBoardStatusValue)
    ? (normalized as JobBoardStatusValue)
    : "por_cotizar";
}

function normalizeProgress(value: number | null | undefined) {
  return Math.min(100, normalizeNonNegative(value));
}

function normalizePriority(value: number | null | undefined) {
  const normalized = Math.round(normalizeNonNegative(value));
  return Math.min(5, Math.max(1, normalized || 3));
}

function compareNullableDate(left: string | null | undefined, right: string | null | undefined) {
  if (!left && !right) {
    return 0;
  }

  if (!left) {
    return 1;
  }

  if (!right) {
    return -1;
  }

  return left.localeCompare(right);
}

function compareJobs(left: JobBoardRecord, right: JobBoardRecord) {
  const dateComparison = compareNullableDate(left.fecha_prometida, right.fecha_prometida);
  if (dateComparison !== 0) {
    return dateComparison;
  }

  if (left.prioridad !== right.prioridad) {
    return left.prioridad - right.prioridad;
  }

  return right.updated_at.localeCompare(left.updated_at);
}

function matchesSearch(record: JobBoardRecord, search: string) {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return true;
  }

  const haystack = [
    record.titulo ?? "",
    record.estado,
    record.notas ?? "",
    record.client?.nombre ?? "",
    record.project?.nombre_proyecto ?? "",
    record.budget?.budget_number ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(needle);
}

function mapRecord(row: JobBoardRowWithRelations): JobBoardRecord {
  return {
    ...row,
    estado: normalizeStatus(row.estado),
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

async function getByIdWithContext(
  context: AuthorizedContext,
  jobId: string,
  includeDeleted = true,
): Promise<JobBoardRecord | null> {
  let query = context.client
    .from(TABLE as never)
    .select(JOBS_SELECT)
    .eq("id", jobId)
    .eq("profile_id", context.userId);

  if (!includeDeleted) {
    query = query.is("deleted_at", null);
  }

  const response = (await query.maybeSingle()) as QueryResponse<JobBoardRowWithRelations>;
  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data ? mapRecord(response.data) : null;
}

export const jobsBoardService = {
  async list(filters: JobsBoardListFilters = {}): Promise<JobBoardRecord[]> {
    const context = await getAuthorizedContext();

    let query = context.client
      .from(TABLE as never)
      .select(JOBS_SELECT)
      .eq("profile_id", context.userId);

    if (!filters.include_deleted) {
      query = query.is("deleted_at", null);
    }

    if (filters.client_id?.trim()) {
      query = query.eq("client_id", filters.client_id);
    }

    if (filters.status?.trim()) {
      query = query.eq("estado", normalizeStatus(filters.status));
    }

    const response = (await query.order("updated_at", { ascending: false })) as QueryResponse<
      JobBoardRowWithRelations[]
    >;

    if (response.error) {
      throw new Error(response.error.message);
    }

    return (response.data ?? [])
      .map(mapRecord)
      .filter((record) => matchesSearch(record, filters.search ?? ""))
      .sort(compareJobs);
  },

  async getDetail(jobId: string): Promise<JobBoardDetailRecord | null> {
    const context = await getAuthorizedContext();
    const record = await getByIdWithContext(context, jobId, true);

    if (!record) {
      return null;
    }

    return { job: record };
  },

  async create(input: JobBoardMutationInput): Promise<JobBoardRecord> {
    const context = await getAuthorizedContext();

    const payload: JobBoardInsert = {
      profile_id: context.userId,
      client_id: input.client_id,
      custom_project_id: normalizeString(input.custom_project_id),
      budget_id: normalizeString(input.budget_id),
      titulo: input.titulo.trim(),
      estado: normalizeStatus(input.estado),
      monto_snapshot: normalizeNonNegative(input.monto_snapshot),
      sena_snapshot: normalizeNonNegative(input.sena_snapshot),
      saldo_snapshot: normalizeNonNegative(input.saldo_snapshot),
      fecha_prometida: normalizeDate(input.fecha_prometida),
      fecha_inicio: normalizeDate(input.fecha_inicio),
      fecha_entrega: normalizeDate(input.fecha_entrega),
      avance_pct: normalizeProgress(input.avance_pct),
      prioridad: normalizePriority(input.prioridad),
      notas: normalizeString(input.notas),
      created_by: context.userId,
      updated_by: context.userId,
      deleted_at: null,
      deleted_by: null,
    };

    const response = (await context.client
      .from(TABLE as never)
      .insert(payload as never)
      .select(JOBS_SELECT)
      .single()) as QueryResponse<JobBoardRowWithRelations>;

    if (response.error || !response.data) {
      throw new Error(response.error?.message || "No se pudo crear la obra.");
    }

    return mapRecord(response.data);
  },

  async update(jobId: string, input: JobBoardMutationInput): Promise<JobBoardRecord> {
    const context = await getAuthorizedContext();

    const payload: JobBoardUpdate = {
      client_id: input.client_id,
      custom_project_id: normalizeString(input.custom_project_id),
      budget_id: normalizeString(input.budget_id),
      titulo: input.titulo.trim(),
      estado: normalizeStatus(input.estado),
      monto_snapshot: normalizeNonNegative(input.monto_snapshot),
      sena_snapshot: normalizeNonNegative(input.sena_snapshot),
      saldo_snapshot: normalizeNonNegative(input.saldo_snapshot),
      fecha_prometida: normalizeDate(input.fecha_prometida),
      fecha_inicio: normalizeDate(input.fecha_inicio),
      fecha_entrega: normalizeDate(input.fecha_entrega),
      avance_pct: normalizeProgress(input.avance_pct),
      prioridad: normalizePriority(input.prioridad),
      notas: normalizeString(input.notas),
      updated_by: context.userId,
      deleted_at: null,
      deleted_by: null,
    };

    const response = (await context.client
      .from(TABLE as never)
      .update(payload as never)
      .eq("id", jobId)
      .eq("profile_id", context.userId)
      .select(JOBS_SELECT)
      .single()) as QueryResponse<JobBoardRowWithRelations>;

    if (response.error || !response.data) {
      throw new Error(response.error?.message || "No se pudo actualizar la obra.");
    }

    return mapRecord(response.data);
  },

  async updateStatus(jobId: string, status: JobBoardStatusValue): Promise<JobBoardRecord> {
    const context = await getAuthorizedContext();

    const response = (await context.client
      .from(TABLE as never)
      .update({
        estado: normalizeStatus(status),
        updated_by: context.userId,
      } as never)
      .eq("id", jobId)
      .eq("profile_id", context.userId)
      .select(JOBS_SELECT)
      .single()) as QueryResponse<JobBoardRowWithRelations>;

    if (response.error || !response.data) {
      throw new Error(response.error?.message || "No se pudo mover la obra.");
    }

    return mapRecord(response.data);
  },
};
