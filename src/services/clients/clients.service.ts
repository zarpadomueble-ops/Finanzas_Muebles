import type { PostgrestError } from "@supabase/supabase-js";
import type { TableInsert, TableRow, TableUpdate } from "@/types";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/services/supabase/browser-client";

const CLIENTS_TABLE = "clients" as const;
const BUDGETS_TABLE = "budgets" as const;
const PROJECTS_TABLE = "custom_projects" as const;

type QueryResponse<T> = {
  data: T | null;
  error: PostgrestError | null;
};

interface ClientsListQuery {
  eq: (column: string, value: string) => ClientsListQuery;
  is: (column: string, value: null) => ClientsListQuery;
  or: (query: string) => ClientsListQuery;
  order: (column: string, options?: { ascending?: boolean }) => Promise<QueryResponse<ClientRow[]>>;
}

interface ClientByIdQuery {
  is: (column: string, value: null) => ClientByIdQuery;
  maybeSingle: () => Promise<QueryResponse<ClientRow>>;
}

export type ClientRow = TableRow<typeof CLIENTS_TABLE>;
export type ClientInsert = TableInsert<typeof CLIENTS_TABLE>;
export type ClientUpdate = TableUpdate<typeof CLIENTS_TABLE>;

export type ClientBudgetHistoryRow = Pick<
  TableRow<typeof BUDGETS_TABLE>,
  "id" | "budget_number" | "estado" | "fecha_emision" | "total_snapshot" | "saldo_snapshot" | "created_at"
>;

export type ClientProjectHistoryRow = Pick<
  TableRow<typeof PROJECTS_TABLE>,
  "id" | "nombre_proyecto" | "fecha" | "status" | "precio_sugerido" | "costo_total" | "utilidad_estimada" | "created_at"
>;

export interface ClientListFilters {
  search?: string;
  ciudad?: string;
  canal_ingreso?: string;
  include_deleted?: boolean;
}

export interface ClientDetailRecord {
  client: ClientRow;
  budgets: ClientBudgetHistoryRow[];
  projects: ClientProjectHistoryRow[];
}

async function getAuthorizedContext() {
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

function normalizeString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export const clientsService = {
  async list(filters: ClientListFilters = {}): Promise<ClientRow[]> {
    const { client, userId } = await getAuthorizedContext();

    let query = client.from(CLIENTS_TABLE as never).select("*") as unknown as ClientsListQuery;
    query = query.eq("profile_id", userId);

    if (!filters.include_deleted) {
      query = query.is("deleted_at", null);
    }

    if (filters.search?.trim()) {
      const escaped = filters.search.trim().replace(/,/g, " ");
      query = query.or(
        [
          `nombre.ilike.%${escaped}%`,
          `email.ilike.%${escaped}%`,
          `telefono.ilike.%${escaped}%`,
          `ciudad.ilike.%${escaped}%`,
          `provincia.ilike.%${escaped}%`,
        ].join(","),
      );
    }

    if (filters.ciudad) {
      query = query.eq("ciudad", filters.ciudad);
    }

    if (filters.canal_ingreso) {
      query = query.eq("canal_ingreso", filters.canal_ingreso);
    }

    const response = (await query.order("created_at", { ascending: false })) as QueryResponse<ClientRow[]>;

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data ?? [];
  },

  async getById(clientId: string, includeDeleted = true): Promise<ClientRow | null> {
    const { client, userId } = await getAuthorizedContext();

    let query = client
      .from(CLIENTS_TABLE as never)
      .select("*")
      .eq("id", clientId)
      .eq("profile_id", userId) as unknown as ClientByIdQuery;

    if (!includeDeleted) {
      query = query.is("deleted_at", null);
    }

    const response = (await query.maybeSingle()) as QueryResponse<ClientRow>;

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data;
  },

  async create(input: Omit<ClientInsert, "id" | "profile_id">): Promise<ClientRow> {
    const { client, userId } = await getAuthorizedContext();

    const payload: ClientInsert = {
      ...input,
      profile_id: userId,
      nombre: input.nombre,
      telefono: normalizeString(input.telefono),
      email: normalizeString(input.email),
      direccion: normalizeString(input.direccion),
      ciudad: normalizeString(input.ciudad),
      provincia: normalizeString(input.provincia),
      notas: normalizeString(input.notas),
      canal_ingreso: normalizeString(input.canal_ingreso),
      fecha_alta: input.fecha_alta || new Date().toISOString().slice(0, 10),
      deleted_at: null,
      deleted_by: null,
    };

    const response = (await client
      .from(CLIENTS_TABLE as never)
      .insert(payload as never)
      .select("*")
      .single()) as QueryResponse<ClientRow>;

    if (response.error || !response.data) {
      throw new Error(response.error?.message || "No se pudo crear el cliente.");
    }

    return response.data;
  },

  async update(clientId: string, input: Omit<ClientUpdate, "id" | "profile_id">): Promise<ClientRow> {
    const { client, userId } = await getAuthorizedContext();

    const payload: ClientUpdate = {
      ...input,
      telefono: normalizeString(input.telefono),
      email: normalizeString(input.email),
      direccion: normalizeString(input.direccion),
      ciudad: normalizeString(input.ciudad),
      provincia: normalizeString(input.provincia),
      notas: normalizeString(input.notas),
      canal_ingreso: normalizeString(input.canal_ingreso),
      updated_by: userId,
    };

    const response = (await client
      .from(CLIENTS_TABLE as never)
      .update(payload as never)
      .eq("id", clientId)
      .eq("profile_id", userId)
      .select("*")
      .single()) as QueryResponse<ClientRow>;

    if (response.error || !response.data) {
      throw new Error(response.error?.message || "No se pudo actualizar el cliente.");
    }

    return response.data;
  },

  async softDelete(clientId: string): Promise<void> {
    const { client, userId } = await getAuthorizedContext();

    const response = (await client
      .from(CLIENTS_TABLE as never)
      .update(
        {
          deleted_at: new Date().toISOString(),
          deleted_by: userId,
          updated_by: userId,
        } as never,
      )
      .eq("id", clientId)
      .eq("profile_id", userId)) as QueryResponse<ClientRow[]>;

    if (response.error) {
      throw new Error(response.error.message);
    }
  },

  async restore(clientId: string): Promise<void> {
    const { client, userId } = await getAuthorizedContext();

    const response = (await client
      .from(CLIENTS_TABLE as never)
      .update(
        {
          deleted_at: null,
          deleted_by: null,
          updated_by: userId,
        } as never,
      )
      .eq("id", clientId)
      .eq("profile_id", userId)) as QueryResponse<ClientRow[]>;

    if (response.error) {
      throw new Error(response.error.message);
    }
  },

  async getHistory(clientId: string): Promise<Pick<ClientDetailRecord, "budgets" | "projects">> {
    const { client, userId } = await getAuthorizedContext();

    const budgetsPromise = client
      .from(BUDGETS_TABLE as never)
      .select("id, budget_number, estado, fecha_emision, total_snapshot, saldo_snapshot, created_at")
      .eq("profile_id", userId)
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    const projectsPromise = client
      .from(PROJECTS_TABLE as never)
      .select("id, nombre_proyecto, fecha, status, precio_sugerido, costo_total, utilidad_estimada, created_at")
      .eq("profile_id", userId)
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    const [budgetsResponse, projectsResponse] = (await Promise.all([
      budgetsPromise,
      projectsPromise,
    ])) as [QueryResponse<ClientBudgetHistoryRow[]>, QueryResponse<ClientProjectHistoryRow[]>];

    if (budgetsResponse.error) {
      throw new Error(budgetsResponse.error.message);
    }

    if (projectsResponse.error) {
      throw new Error(projectsResponse.error.message);
    }

    return {
      budgets: budgetsResponse.data ?? [],
      projects: projectsResponse.data ?? [],
    };
  },

  async getDetail(clientId: string): Promise<ClientDetailRecord | null> {
    const [clientRecord, history] = await Promise.all([
      this.getById(clientId, true),
      this.getHistory(clientId),
    ]);

    if (!clientRecord) {
      return null;
    }

    return {
      client: clientRecord,
      budgets: history.budgets,
      projects: history.projects,
    };
  },
};
