"use client";

import Link from "next/link";
import {
  FileText,
  Gauge,
  KanbanSquare,
  Package,
  Scissors,
  Settings,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Wallet,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { canRoleAccessModule } from "@/features/auth/services/role.service";
import { APP_NAVIGATION } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type { AppModuleKey, AppUserRole, ModuleNavigationItem } from "@/types";

export const defaultSidebarModuleIcons: Record<AppModuleKey, LucideIcon> = {
  dashboard: Gauge,
  clientes: Users,
  materiales: Package,
  parametros: SlidersHorizontal,
  proyectos: ShoppingBag,
  ecommerce: ShoppingCart,
  corte: Scissors,
  compras: Package,
  presupuestos: FileText,
  obras: KanbanSquare,
  rentabilidad: TrendingUp,
  finanzas: Wallet,
  configuracion: Settings,
};

interface SidebarNavProps {
  pathname: string;
  userRole: AppUserRole;
  collapsed?: boolean;
  onNavigate?: () => void;
  items?: ModuleNavigationItem[];
  icons?: Record<AppModuleKey, LucideIcon>;
  className?: string;
}

export function SidebarNav({
  pathname,
  userRole,
  collapsed = false,
  onNavigate,
  items = APP_NAVIGATION,
  icons = defaultSidebarModuleIcons,
  className,
}: SidebarNavProps) {
  return (
    <nav className={cn("space-y-1 px-3 py-4", className)}>
      {items.filter((item) => canRoleAccessModule(userRole, item.key)).map((item) => {
        const Icon = icons[item.key];
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-3 py-2 transition",
              active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
              collapsed && "justify-center px-2",
            )}
            title={item.label}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <div className={cn("min-w-0", collapsed && "hidden")}>
              <p className="truncate text-sm font-medium">{item.label}</p>
              <p className={cn("truncate text-xs", active ? "text-slate-200" : "text-slate-500")}>{item.description}</p>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
