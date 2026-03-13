"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/services/supabase/server-client";

export async function logoutAction() {
  const supabase = await getSupabaseServerClient();
  if (supabase) {
    await supabase.auth.signOut();
  }

  redirect("/login");
}

