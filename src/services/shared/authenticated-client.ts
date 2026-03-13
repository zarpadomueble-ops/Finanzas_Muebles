import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/services/supabase/browser-client";
import type { Database } from "@/types";

export interface AuthorizedBrowserContext {
  client: SupabaseClient<Database>;
  userId: string;
}

export async function getAuthorizedBrowserContext(): Promise<AuthorizedBrowserContext> {
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

  return {
    client,
    userId: user.id,
  };
}

