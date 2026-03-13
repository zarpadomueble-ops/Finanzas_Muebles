import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}

export function EmptyState({
  title,
  description = "No hay datos disponibles para mostrar.",
  action,
  icon: Icon = Inbox,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center", className)}>
      <div className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-600">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-3 text-base font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
