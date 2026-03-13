import type { User } from "@supabase/supabase-js";
import type { AppModuleKey, AppUserRole } from "@/types";
import type { ModuleAccessMap } from "../types";

const VALID_ROLES = new Set<AppUserRole>(["admin", "ventas", "produccion", "lectura"]);

const ROLE_MODULE_ACCESS: ModuleAccessMap = {
  admin: [
    "dashboard",
    "clientes",
    "materiales",
    "parametros",
    "proyectos",
    "ecommerce",
    "corte",
    "compras",
    "presupuestos",
    "obras",
    "rentabilidad",
    "finanzas",
    "configuracion",
  ],
  ventas: [
    "dashboard",
    "clientes",
    "proyectos",
    "ecommerce",
    "presupuestos",
    "rentabilidad",
    "finanzas",
  ],
  produccion: ["dashboard", "materiales", "proyectos", "corte", "compras", "obras", "finanzas"],
  lectura: [
    "dashboard",
    "clientes",
    "materiales",
    "parametros",
    "proyectos",
    "ecommerce",
    "corte",
    "compras",
    "presupuestos",
    "obras",
    "rentabilidad",
    "finanzas",
    "configuracion",
  ],
};

export function parseAppRole(input: unknown): AppUserRole {
  if (typeof input !== "string") {
    return "lectura";
  }

  const normalized = input.trim().toLowerCase();
  return VALID_ROLES.has(normalized as AppUserRole) ? (normalized as AppUserRole) : "lectura";
}

export function resolveUserRole(user: User): AppUserRole {
  const roleFromMetadata =
    user.app_metadata?.app_role ??
    user.app_metadata?.role ??
    user.user_metadata?.app_role ??
    user.user_metadata?.role;

  return parseAppRole(roleFromMetadata);
}

export function canRoleAccessModule(role: AppUserRole, module: AppModuleKey) {
  return ROLE_MODULE_ACCESS[role].includes(module);
}

export function isSafeInternalPath(value: string | null | undefined): value is string {
  if (!value) {
    return false;
  }

  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/login");
}

