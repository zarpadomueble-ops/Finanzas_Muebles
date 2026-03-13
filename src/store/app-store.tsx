"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createSeedState } from "@/lib/data/seed";
import { moveJobsBoardStatus, optimizeCutJobFromState } from "@/domain/state-services";
import { AppState, JobStatus, Settings } from "@/lib/types";
import { nowIso, round, safeDiv } from "@/lib/utils";

const STORAGE_KEY = "carpi-erp-state-v1";

export interface SearchHit {
  id: string;
  module: string;
  title: string;
  subtitle: string;
  href: string;
}

interface StoreActions {
  resetSeed: () => void;
  updateSettings: (partial: Partial<Settings>) => void;
  optimizeCutJob: (jobId: string, iteration?: number) => void;
  moveJobStatus: (jobId: string, status: JobStatus) => void;
  globalSearch: (query: string) => SearchHit[];
  generateBudgetWhatsAppText: (budgetId: string) => string;
}

interface AppStoreContextValue {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  hydrated: boolean;
  actions: StoreActions;
}

const AppStoreContext = createContext<AppStoreContextValue | undefined>(undefined);

function recalcSettings(payload: Partial<Settings>, current: Settings): Settings {
  const merged = {
    ...current,
    ...payload,
  };

  return {
    ...merged,
    costoHoraTaller: round(safeDiv(merged.costosFijosMes, merged.horasProductivasMes)),
    updatedAt: nowIso(),
  };
}

function buildSearchIndex(state: AppState): SearchHit[] {
  const clients = state.clients.map((row) => ({
    id: `c-${row.id}`,
    module: "Clientes",
    title: row.nombre,
    subtitle: `${row.ciudad} | ${row.telefono}`,
    href: "/clientes",
  }));

  const materials = state.materials.map((row) => ({
    id: `m-${row.id}`,
    module: "Materiales",
    title: row.nombre,
    subtitle: `${row.codigo} | ${row.categoria}`,
    href: "/materiales",
  }));

  const projects = state.projectsCustom.map((row) => ({
    id: `p-${row.id}`,
    module: "Proyectos",
    title: row.nombreProyecto,
    subtitle: `${row.tipoMueble} | ${row.fecha}`,
    href: "/proyectos",
  }));

  const budgets = state.budgets.map((row) => ({
    id: `b-${row.id}`,
    module: "Presupuestos",
    title: `Presupuesto ${row.id.slice(0, 8)}`,
    subtitle: `${row.fecha} | ${row.total.toLocaleString("es-AR")}`,
    href: "/presupuestos",
  }));

  return [...clients, ...materials, ...projects, ...budgets];
}

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => {
    if (typeof window === "undefined") {
      return createSeedState();
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createSeedState();
    }

    try {
      return JSON.parse(raw) as AppState;
    } catch {
      return createSeedState();
    }
  });
  const hydrated = true;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const timeout = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, 250);

    return () => clearTimeout(timeout);
  }, [state]);

  const resetSeed = useCallback(() => {
    setState(createSeedState());
  }, []);

  const updateSettings = useCallback((partial: Partial<Settings>) => {
    setState((current) => ({
      ...current,
      settings: recalcSettings(partial, current.settings),
    }));
  }, []);

  const optimizeCutJob = useCallback((jobId: string, iteration = 1) => {
    setState((current) => optimizeCutJobFromState(current, jobId, iteration));
  }, []);

  const moveJobStatus = useCallback((jobId: string, status: JobStatus) => {
    setState((current) => moveJobsBoardStatus(current, jobId, status));
  }, []);

  const globalSearch = useCallback(
    (query: string) => {
      const q = query.trim().toLowerCase();
      if (!q) {
        return [];
      }

      return buildSearchIndex(state)
        .filter((row) => `${row.title} ${row.subtitle} ${row.module}`.toLowerCase().includes(q))
        .slice(0, 8);
    },
    [state],
  );

  const generateBudgetWhatsAppText = useCallback(
    (budgetId: string) => {
      const budget = state.budgets.find((row) => row.id === budgetId);
      if (!budget) {
        return "";
      }

      const client = state.clients.find((row) => row.id === budget.clientId);
      const lines = budget.lineas
        .map((line) => `- ${line.descripcion}: $${line.monto.toLocaleString("es-AR")}`)
        .join("\n");

      return `Hola ${client?.nombre ?? "cliente"}, te compartimos el presupuesto #${budget.id.slice(0, 8)}:\n${lines}\n\nTotal: $${budget.total.toLocaleString("es-AR")}\nSeña: $${budget.sena.toLocaleString("es-AR")}\nSaldo: $${budget.saldo.toLocaleString("es-AR")}\nValidez: ${budget.validezDias} días.`;
    },
    [state],
  );

  const actions = useMemo(
    () => ({
      resetSeed,
      updateSettings,
      optimizeCutJob,
      moveJobStatus,
      globalSearch,
      generateBudgetWhatsAppText,
    }),
    [generateBudgetWhatsAppText, globalSearch, moveJobStatus, optimizeCutJob, resetSeed, updateSettings],
  );

  const value = useMemo(
    () => ({
      state,
      setState,
      hydrated,
      actions,
    }),
    [actions, hydrated, state],
  );

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>;
}

export function useAppStore() {
  const context = useContext(AppStoreContext);
  if (!context) {
    throw new Error("useAppStore must be used inside AppStoreProvider");
  }

  return context;
}



