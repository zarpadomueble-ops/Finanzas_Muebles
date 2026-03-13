"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { RefreshCcw } from "lucide-react";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { KPIStatCard, ModuleHeader, SectionCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { getDashboardOverviewRecord } from "@/features/dashboard/actions";
import { formatCurrencyValue, formatNumberValue, formatPercentValue } from "@/lib/format";
import { cn } from "@/lib/utils";

const CATEGORY_COLORS = ["#0f172a", "#334155", "#475569", "#64748b", "#94a3b8", "#cbd5e1"];
const MATERIAL_COLORS = ["#1d4ed8", "#0f766e", "#b45309", "#7c3aed", "#0f172a", "#475569"];

function formatCompactLabel(label: string, maxLength = 18) {
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label;
}

export function DashboardModule() {
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: getDashboardOverviewRecord,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <LoadingState
        title="Cargando dashboard"
        description="Consolidando presupuestos, obras, corte y materiales desde Supabase..."
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        description={error instanceof Error ? error.message : "No se pudo cargar el dashboard."}
        onRetry={() => void refetch()}
      />
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="Sin datos"
        description="No se encontro informacion para construir el dashboard."
      />
    );
  }

  const hasOperationalData =
    data.summary.approvedBudgets > 0 ||
    data.summary.activeProjects > 0 ||
    data.summary.consumedBoards > 0 ||
    data.topMaterials.length > 0;

  return (
    <div className="space-y-4">
      <ModuleHeader
        title="Dashboard"
        description="KPIs operativos y financieros construidos sobre presupuestos, obras, optimizaciones y consumos reales."
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCcw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} />
            Actualizar
          </Button>
        }
      />

      {!hasOperationalData ? (
        <EmptyState
          title="Todavia no hay base operativa suficiente"
          description="Cuando existan presupuestos aprobados, obras activas o materiales cargados, el dashboard mostrara tendencias y KPIs reales."
        />
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <KPIStatCard label="Ventas aprobadas" value={data.summary.totalSales} />
        <KPIStatCard label="Costos comprometidos" value={data.summary.totalCommittedCosts} />
        <KPIStatCard
          label="Margen promedio"
          value={data.summary.averageMarginPct}
          format="number"
          suffix="%"
        />
        <KPIStatCard label="Proyectos activos" value={data.summary.activeProjects} format="number" />
        <KPIStatCard label="Placas consumidas" value={data.summary.consumedBoards} format="number" />
        <KPIStatCard label="Costo de placas" value={data.summary.boardCost} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
        <SectionCard
          title="Ventas por mes"
          description="Presupuestos aprobados y su costo snapshot historico."
          contentClassName="h-[320px]"
        >
          {data.salesByMonth.length === 0 ? (
            <EmptyState
              title="Sin ventas aprobadas"
              description="Todavia no hay presupuestos aprobados para construir la serie mensual."
              className="h-full p-6"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
              <ComposedChart data={data.salesByMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="monthLabel" tickLine={false} axisLine={false} />
                <YAxis
                  width={110}
                  tickFormatter={(value) =>
                    formatCurrencyValue(Number(value), { maximumFractionDigits: 0 })
                  }
                />
                <Tooltip
                  formatter={(value, name) => [formatCurrencyValue(Number(value ?? 0)), String(name)]}
                  labelFormatter={(label) => `Periodo ${label}`}
                />
                <Legend />
                <Bar dataKey="revenue" name="Ventas" fill="#0f172a" radius={[8, 8, 0, 0]} />
                <Bar dataKey="cost" name="Costos" fill="#94a3b8" radius={[8, 8, 0, 0]} />
                <Line
                  type="monotone"
                  dataKey="utility"
                  name="Utilidad"
                  stroke="#0f766e"
                  strokeWidth={2.5}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard
          title="Indicadores del corte"
          description="Uso agregado del optimizador sobre trabajos realmente guardados."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Aprovechamiento medio
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {formatPercentValue(data.summary.averageUtilizationPct, { digits: 1 })}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Presupuestos aprobados
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {formatNumberValue(data.summary.approvedBudgets, { digits: 0 })}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Utilidad comprometida
              </p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">
                {formatCurrencyValue(data.summary.totalUtility)}
              </p>
            </div>
          </div>
        </SectionCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="Costos por categoria"
          description="Costo snapshot consolidado por categoria de material activa."
          contentClassName="h-[320px]"
        >
          {data.costByCategory.length === 0 ? (
            <EmptyState
              title="Sin categorias para analizar"
              description="Carga proyectos o productos con materiales para ver la distribucion de costos por categoria."
              className="h-full p-6"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
              <BarChart data={data.costByCategory} layout="vertical" margin={{ left: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  tickFormatter={(value) =>
                    formatCurrencyValue(Number(value), { maximumFractionDigits: 0 })
                  }
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={110}
                  tickFormatter={(value) => formatCompactLabel(String(value), 14)}
                />
                <Tooltip formatter={(value) => formatCurrencyValue(Number(value ?? 0))} />
                <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                  {data.costByCategory.map((entry, index) => (
                    <Cell key={entry.label} fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard
          title="Top materiales usados"
          description="Materiales con mayor peso economico dentro de snapshots activos."
          contentClassName="h-[320px]"
        >
          {data.topMaterials.length === 0 ? (
            <EmptyState
              title="Sin materiales consumidos"
              description="Todavia no hay lineas snapshot de materiales para construir el ranking."
              className="h-full p-6"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
              <BarChart data={data.topMaterials} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  tickFormatter={(value) =>
                    formatCurrencyValue(Number(value), { maximumFractionDigits: 0 })
                  }
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={120}
                  tickFormatter={(value) => formatCompactLabel(String(value), 16)}
                />
                <Tooltip
                  formatter={(value, _name, item) => {
                    const payload = item.payload as { quantity: number };
                    return [
                      `${formatCurrencyValue(Number(value ?? 0))} | ${formatNumberValue(payload.quantity)} u`,
                      "Costo acumulado",
                    ];
                  }}
                />
                <Bar dataKey="value" radius={[0, 8, 8, 0]}>
                  {data.topMaterials.map((entry, index) => (
                    <Cell key={entry.label} fill={MATERIAL_COLORS[index % MATERIAL_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </section>
    </div>
  );
}


