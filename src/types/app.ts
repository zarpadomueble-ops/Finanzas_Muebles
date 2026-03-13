export type AppModuleKey =
  | "dashboard"
  | "clientes"
  | "materiales"
  | "parametros"
  | "proyectos"
  | "ecommerce"
  | "corte"
  | "compras"
  | "presupuestos"
  | "obras"
  | "rentabilidad"
  | "configuracion";

export type AppUserRole = "admin" | "ventas" | "produccion" | "lectura";

export interface ModuleNavigationItem {
  key: AppModuleKey;
  label: string;
  href: string;
  description: string;
}

export interface AppShellUser {
  id: string;
  fullName: string;
  email: string;
  role: AppUserRole;
  avatarUrl: string | null;
}
