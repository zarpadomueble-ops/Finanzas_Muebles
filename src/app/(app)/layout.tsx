import { type ReactNode } from "react";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getAuthenticatedAppUser } from "@/features/auth/services/session.service";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getAuthenticatedAppUser();

  if (!user) {
    redirect("/login");
  }

  return <AppShell user={user}>{children}</AppShell>;
}
