"use client";

import { ChevronsLeft, ChevronsRight, Menu } from "lucide-react";
import { useState } from "react";
import { LogoutButton } from "@/features/auth/components";
import { PeriodSelector } from "@/components/layout/period-selector";
import { SearchInput } from "@/components/forms/search-input";
import { Badge } from "@/components/ui/badge";
import type { AppShellUser } from "@/types";

interface TopbarProps {
  user: AppShellUser;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMobileSidebar: () => void;
}

export function Topbar({ user, isSidebarCollapsed, onToggleSidebar, onOpenMobileSidebar }: TopbarProps) {
  const [query, setQuery] = useState("");

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex h-16 items-center justify-between gap-3 px-4 lg:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 lg:hidden"
            aria-label="Abrir menu"
          >
            <Menu className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onToggleSidebar}
            className="hidden h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 lg:inline-flex"
            aria-label={isSidebarCollapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          >
            {isSidebarCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>

          <SearchInput
            className="w-full max-w-xl"
            value={query}
            onChange={setQuery}
            placeholder="Buscador global (placeholder)"
            ariaLabel="Buscador global"
          />
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden xl:block">
            <PeriodSelector />
          </div>
          <div className="hidden rounded-md border border-slate-200 px-3 py-1.5 text-right sm:block">
            <p className="text-xs text-slate-500">{user.email}</p>
            <div className="mt-0.5 flex items-center justify-end gap-2">
              <p className="text-sm font-medium text-slate-900">{user.fullName}</p>
              <Badge variant="secondary">{user.role}</Badge>
            </div>
          </div>
          <LogoutButton className="hidden sm:inline-flex" />
          <LogoutButton compact className="sm:hidden" />
        </div>
      </div>
    </header>
  );
}
