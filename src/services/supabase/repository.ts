import type { PostgrestError } from "@supabase/supabase-js";
import type { PublicTableName, TableRow } from "@/types";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/services/supabase/browser-client";

type SelectResponse<T> = {
  data: T[] | null;
  error: PostgrestError | null;
};

type MutationResponse = {
  error: PostgrestError | null;
};

export async function fetchTableRows<T extends PublicTableName>(table: T): Promise<TableRow<T>[]> {
  if (!hasSupabaseConfig()) {
    return [];
  }

  const client = getSupabaseBrowserClient();
  if (!client) {
    return [];
  }

  const response = (await client.from(table as never).select("*")) as unknown as SelectResponse<TableRow<T>>;
  if (response.error) {
    throw response.error;
  }

  return response.data ?? [];
}

export async function upsertTableRows<T extends PublicTableName>(
  table: T,
  rows: Array<Partial<TableRow<T>>>,
) {
  if (!hasSupabaseConfig() || rows.length === 0) {
    return;
  }

  const client = getSupabaseBrowserClient();
  if (!client) {
    return;
  }

  const response = (await client.from(table as never).upsert(rows as never, {
    onConflict: "id",
  })) as unknown as MutationResponse;

  if (response.error) {
    throw response.error;
  }
}

export async function deleteTableRow<T extends PublicTableName>(table: T, id: string) {
  if (!hasSupabaseConfig()) {
    return;
  }

  const client = getSupabaseBrowserClient();
  if (!client) {
    return;
  }

  const response = (await client.from(table as never).delete().eq("id", id)) as unknown as MutationResponse;
  if (response.error) {
    throw response.error;
  }
}
