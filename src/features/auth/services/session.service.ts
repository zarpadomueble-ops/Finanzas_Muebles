import "server-only";
import type { AppShellUser, Database } from "@/types";
import { getSupabaseServerClient } from "@/services/supabase/server-client";
import { resolveUserRole } from "./role.service";

type ProfilePreview = Pick<Database["public"]["Tables"]["profiles"]["Row"], "full_name" | "email" | "avatar_url">;

function resolveDisplayName(
  metadata: { full_name?: unknown; name?: unknown } | undefined,
  profile: ProfilePreview | null,
  email: string,
) {
  const byProfile = profile?.full_name?.trim();
  if (byProfile) {
    return byProfile;
  }

  const fromMetadata =
    typeof metadata?.full_name === "string"
      ? metadata.full_name
      : typeof metadata?.name === "string"
        ? metadata.name
        : "";

  const byMetadata = fromMetadata.trim();
  if (byMetadata) {
    return byMetadata;
  }

  return email.split("@")[0] || "Usuario";
}

export async function getAuthenticatedAppUser(): Promise<AppShellUser | null> {
  const supabase = await getSupabaseServerClient();
  if (!supabase) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  const { data: profileData } = await supabase
    .from("profiles")
    .select("full_name, email, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  const profile = profileData as ProfilePreview | null;

  const email = user.email ?? profile?.email ?? "";

  return {
    id: user.id,
    fullName: resolveDisplayName(user.user_metadata, profile ?? null, email),
    email,
    role: resolveUserRole(user),
    avatarUrl: profile?.avatar_url ?? null,
  };
}

