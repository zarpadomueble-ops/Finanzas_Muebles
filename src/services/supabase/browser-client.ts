import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, PublicTableName } from "@/types";
import { executeLocalQuery, shouldFallbackToLocal } from "./local-fallback";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const DATA_MODE_STORAGE_KEY = "carpi-erp-supabase-data-mode";

type QueryOperation = "select" | "insert" | "update" | "delete" | "upsert";
type ResultMode = "many" | "single" | "maybeSingle";
type DataMode = "unknown" | "remote" | "local";

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

type QueryResult = {
  data: unknown;
  error: {
    code: string;
    details: string | null;
    hint: string | null;
    message: string;
  } | null;
};

let browserClient: SupabaseClient<Database> | null = null;
let proxiedClient: SupabaseClient<Database> | null = null;
let dataMode: DataMode = "unknown";
let dataModeResolution: Promise<DataMode> | null = null;

function invokeQueryMethod(builder: unknown, method: string, ...args: unknown[]) {
  const candidate = builder as Record<string, ((...innerArgs: unknown[]) => unknown) | undefined>;
  const fn = candidate[method];

  if (typeof fn !== "function") {
    throw new Error(`Supabase query builder does not implement ${method}.`);
  }

  return fn.apply(builder, args);
}

function createInitialState(table: PublicTableName): QueryState {
  return {
    table,
    operation: "select",
    filters: [],
    orders: [],
    resultMode: "many",
  };
}

function canUseSessionStorage() {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function getDataModeStorageKey() {
  return `${DATA_MODE_STORAGE_KEY}:${supabaseUrl ?? "missing"}`;
}

function readPersistedDataMode(): DataMode {
  if (!canUseSessionStorage()) {
    return "unknown";
  }

  const storedValue = window.sessionStorage.getItem(getDataModeStorageKey());
  return storedValue === "local" ? "local" : "unknown";
}

function persistDataMode(nextMode: DataMode) {
  if (!canUseSessionStorage()) {
    return;
  }

  if (nextMode === "local") {
    window.sessionStorage.setItem(getDataModeStorageKey(), nextMode);
    return;
  }

  window.sessionStorage.removeItem(getDataModeStorageKey());
}

class HybridQuery implements PromiseLike<QueryResult> {
  private state: QueryState;
  private client: SupabaseClient<Database>;

  constructor(client: SupabaseClient<Database>, table: PublicTableName) {
    this.client = client;
    this.state = createInitialState(table);
  }

  select(columns = "*") {
    this.state.select = columns;
    return this;
  }

  insert(payload: unknown) {
    this.state.operation = "insert";
    this.state.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.state.operation = "update";
    this.state.payload = payload;
    return this;
  }

  delete() {
    this.state.operation = "delete";
    this.state.payload = undefined;
    return this;
  }

  upsert(payload: unknown, options?: { onConflict?: string }) {
    this.state.operation = "upsert";
    this.state.payload = payload;
    this.state.options = options;
    return this;
  }

  eq(column: string, value: unknown) {
    this.state.filters.push({ kind: "eq", column, value });
    return this;
  }

  is(column: string, value: null) {
    this.state.filters.push({ kind: "is", column, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.state.filters.push({ kind: "in", column, values });
    return this;
  }

  or(query: string) {
    this.state.filters.push({ kind: "or", query });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.state.orders.push({
      column,
      ascending: options?.ascending ?? true,
    });
    return this;
  }

  limit(value: number) {
    this.state.limit = value;
    return this;
  }

  single() {
    this.state.resultMode = "single";
    return this;
  }

  maybeSingle() {
    this.state.resultMode = "maybeSingle";
    return this;
  }

  then<TResult1 = QueryResult, TResult2 = never>(
    onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }

  catch<TResult = never>(onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null) {
    return this.execute().catch(onrejected);
  }

  finally(onfinally?: (() => void) | null) {
    return this.execute().finally(onfinally ?? undefined);
  }

  private async execute(): Promise<QueryResult> {
    const resolvedMode = await this.resolveDataMode();
    if (resolvedMode !== "local") {
      const remoteResult = await this.executeRemote();
      if (!remoteResult.error) {
        dataMode = "remote";
        return remoteResult;
      }

      if (!shouldFallbackToLocal(remoteResult.error)) {
        return remoteResult;
      }

      dataMode = "local";
      persistDataMode("local");
    }

    return executeLocalQuery(this.state);
  }

  private async resolveDataMode(): Promise<DataMode> {
    if (dataMode === "local" || dataMode === "remote") {
      return dataMode;
    }

    const persistedMode = readPersistedDataMode();
    if (persistedMode === "local") {
      dataMode = "local";
      return dataMode;
    }

    if (!dataModeResolution) {
      dataModeResolution = this.probeRemoteMode().finally(() => {
        dataModeResolution = null;
      });
    }

    dataMode = await dataModeResolution;
    return dataMode;
  }

  private async probeRemoteMode(): Promise<DataMode> {
    const probeResult = (await this.client
      .from("profiles")
      .select("id")
      .limit(1)) as QueryResult;

    if (probeResult.error && shouldFallbackToLocal(probeResult.error)) {
      persistDataMode("local");
      return "local";
    }

    return "remote";
  }

  private async executeRemote(): Promise<QueryResult> {
    let query: unknown = this.client.from(this.state.table as never);

    if (this.state.operation === "select") {
      query = invokeQueryMethod(query, "select", this.state.select ?? "*");
    }

    if (this.state.operation === "insert") {
      query = invokeQueryMethod(query, "insert", this.state.payload as never);
      if (this.state.select) {
        query = invokeQueryMethod(query, "select", this.state.select);
      }
    }

    if (this.state.operation === "update") {
      query = invokeQueryMethod(query, "update", this.state.payload as never);
      if (this.state.select) {
        query = invokeQueryMethod(query, "select", this.state.select);
      }
    }

    if (this.state.operation === "delete") {
      query = invokeQueryMethod(query, "delete");
      if (this.state.select) {
        query = invokeQueryMethod(query, "select", this.state.select);
      }
    }

    if (this.state.operation === "upsert") {
      query = invokeQueryMethod(query, "upsert", this.state.payload as never, this.state.options as never);
      if (this.state.select) {
        query = invokeQueryMethod(query, "select", this.state.select);
      }
    }

    for (const filter of this.state.filters) {
      if (filter.kind === "eq") {
        query = invokeQueryMethod(query, "eq", filter.column, filter.value);
      }

      if (filter.kind === "is") {
        query = invokeQueryMethod(query, "is", filter.column, filter.value);
      }

      if (filter.kind === "in") {
        query = invokeQueryMethod(query, "in", filter.column, filter.values);
      }

      if (filter.kind === "or") {
        query = invokeQueryMethod(query, "or", filter.query);
      }
    }

    for (const order of this.state.orders) {
      query = invokeQueryMethod(query, "order", order.column, { ascending: order.ascending });
    }

    if (typeof this.state.limit === "number") {
      query = invokeQueryMethod(query, "limit", this.state.limit);
    }

    if (this.state.resultMode === "single") {
      query = invokeQueryMethod(query, "single");
    }

    if (this.state.resultMode === "maybeSingle") {
      query = invokeQueryMethod(query, "maybeSingle");
    }

    return await (query as PromiseLike<QueryResult>);
  }
}

function getBaseBrowserClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  if (!browserClient) {
    browserClient = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
  }

  return browserClient;
}

export function hasSupabaseConfig() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export function getSupabaseBrowserClient(): SupabaseClient<Database> | null {
  if (dataMode === "unknown") {
    dataMode = readPersistedDataMode();
  }

  const baseClient = getBaseBrowserClient();
  if (!baseClient) {
    return null;
  }

  if (proxiedClient) {
    return proxiedClient;
  }

  proxiedClient = new Proxy(baseClient, {
    get(target, prop, receiver) {
      if (prop === "from") {
        return (table: PublicTableName) => new HybridQuery(target, table) as never;
      }

      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as SupabaseClient<Database>;

  return proxiedClient;
}
