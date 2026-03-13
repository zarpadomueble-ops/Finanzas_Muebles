"use client";

import { CheckCircle2, Clock3, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type SaveIndicatorState = "idle" | "saving" | "saved" | "error";

interface SaveIndicatorProps {
  state: SaveIndicatorState;
  className?: string;
}

const stateConfig: Record<SaveIndicatorState, { label: string; icon: typeof Clock3; className: string }> = {
  idle: { label: "Sin cambios", icon: Clock3, className: "text-slate-500" },
  saving: { label: "Guardando...", icon: Clock3, className: "text-amber-700" },
  saved: { label: "Guardado", icon: CheckCircle2, className: "text-emerald-700" },
  error: { label: "Error al guardar", icon: AlertCircle, className: "text-rose-700" },
};

export function SaveIndicator({ state, className }: SaveIndicatorProps) {
  const { label, icon: Icon, className: toneClass } = stateConfig[state];

  return (
    <div
      className={cn("inline-flex items-center gap-1.5 text-xs font-medium", toneClass, className)}
      aria-live="polite"
    >
      <Icon className={cn("h-3.5 w-3.5", state === "saving" ? "animate-spin" : undefined)} />
      <span>{label}</span>
    </div>
  );
}
