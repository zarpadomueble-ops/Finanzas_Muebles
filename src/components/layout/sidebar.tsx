"use client";

import { Factory, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { cn } from "@/lib/utils";
import type { AppUserRole } from "@/types";

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  userRole: AppUserRole;
}

function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn("px-4 py-5", collapsed && "px-3")}>
      <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
          <Factory className="h-5 w-5" />
        </div>
        <div className={cn(collapsed && "hidden")}>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Gestion industrial</p>
          <h1 className="mt-1 text-lg font-semibold text-slate-900">Carpi ERP</h1>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ collapsed, mobileOpen, onCloseMobile, userRole }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 lg:flex",
          collapsed ? "w-20" : "w-72",
        )}
      >
        <div className="border-b border-slate-200">
          <SidebarBrand collapsed={collapsed} />
        </div>
        <SidebarNav pathname={pathname} userRole={userRole} collapsed={collapsed} />
      </aside>

      <div
        className={cn(
          "fixed inset-0 z-40 bg-slate-900/40 transition-opacity lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onCloseMobile}
        aria-hidden
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 border-r border-slate-200 bg-white shadow-xl transition-transform duration-200 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-200 pr-3">
          <SidebarBrand collapsed={false} />
          <button
            type="button"
            onClick={onCloseMobile}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600"
            aria-label="Cerrar menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <SidebarNav pathname={pathname} userRole={userRole} onNavigate={onCloseMobile} />
      </aside>
    </>
  );
}
