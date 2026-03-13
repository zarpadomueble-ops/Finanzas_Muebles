import { getSupabaseBrowserClient } from "@/services/supabase";
import { upsertTableRows } from "@/services/supabase/repository";
import type { LoginCredentials } from "../types";

function getNameFromMetadata(metadata: { full_name?: unknown; name?: unknown } | undefined, email: string | null) {
  if (typeof metadata?.full_name === "string" && metadata.full_name.trim()) {
    return metadata.full_name.trim();
  }

  if (typeof metadata?.name === "string" && metadata.name.trim()) {
    return metadata.name.trim();
  }

  return email?.split("@")[0] || "Usuario";
}

export async function signInWithPassword(credentials: LoginCredentials) {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { error: "Falta configurar NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY." };
  }

  const { data, error } = await supabase.auth.signInWithPassword(credentials);

  if (error) {
    return { error: error.message };
  }

  if (data.user) {
    const fullName = getNameFromMetadata(data.user.user_metadata, data.user.email ?? null);

    try {
      await upsertTableRows("profiles", [
        {
          id: data.user.id,
          full_name: fullName,
          email: data.user.email ?? null,
        },
      ]);
    } catch (profileSyncError) {
      console.warn("Profile sync skipped during sign-in.", profileSyncError);
    }
  }

  return { error: null };
}

export async function signOutCurrentSession() {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { error: "No se pudo cerrar sesion porque falta configuracion de Supabase." };
  }

  const { error } = await supabase.auth.signOut();
  return { error: error?.message ?? null };
}
