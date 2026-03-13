import type { AppModuleKey, AppUserRole } from "@/types";

export type { AppUserRole as AuthRole };

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: AppUserRole;
  avatarUrl: string | null;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export type ModuleAccessMap = Record<AppUserRole, readonly AppModuleKey[]>;
