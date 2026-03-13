"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { useQuery } from "@tanstack/react-query";
import { RefreshCcw } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { FilterBar, SearchInput } from "@/components/forms";
import { KPIStatCard, ModuleHeader, PercentageBadge, SectionCard, StatusBadge } from "@/components/shared";
import { CurrencyCell, DataGrid } from "@/components/tables";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  calculateBreakEvenPoint,
  calculateRealMarginPct,
  calculateUtility,
} from "@/domain/costing/engine";
import { getProfitabilityOverviewRecord } from "@/features/profitability/actions";
import type {
  ProfitabilityFilters,
  ProfitabilityOverview,
  ProfitabilitySourceFilter,
} from "@/features/profitability/types";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  formatCurrencyValue,
  formatDateValue,
  formatNumberValue,
  formatPercentValue,
} from "@/lib/format";
import { cn } from "@/lib/utils";

const PIE_COLORS = ["#0f172a", "#334155", "#0f766e", "#b45309"];
const BAR_COLORS = ["#1d4ed8", "#0f766e", "#7c3aed", "#b45309", "#0f172a"];

const INITIAL_FILTERS: ProfitabilityFilters = {
  search: "",
  source: "all",
};

function truncateLabel(label: string, maxLength = 18) {
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label;
}

function getSourceLabel(source: ProfitabilitySourceFilter | ProfitabilityOverview["rows"][number]["source"]) {
  return source === "project" ? "Proyecto" : source === "ecommerce" ? "Ecommerce" : "Todos";
}

export function ProfitabilityModule() {
  const [filters, setFilters] = useState<ProfitabilityFilters>(INITIAL_FILTERS);
  const [simulatorRowId, setSimulatorRowId] = useState<string>("");
  const [simulatorPriceInput, setSimulatorPriceInput] = useState<number | null>(null);
  const [simulatorCostInput, setSimulatorCostInput] = useState<number | null>(null);
  const [simulatorFixedCostsInput, setSimulatorFixedCostsInput] = useState<number | null>(null);
  const [simulatorUnitsInput, setSimulatorUnitsInput] = useState<number | null>(null);

  const debouncedSearch = useDebouncedValue(filters.search || "", 250);
  const queryFilters = useMemo<ProfitabilityFilters>(
    () => ({
      search: debouncedSearch,
      source: filters.source || "all",
    }),
    [debouncedSearch, filters.source],
  );

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ["profitability-overview", queryFilters],
    queryFn: () => getProfitabilityOverviewRecord(queryFilters),
    staleTime: 60_000,
  });

  const simulatorRow = useMemo(
    () => data?.rows.find((row) => row.id === simulatorRowId) ?? data?.rows[0] ?? null,
    [data?.rows, simulatorRowId],
  );

  const usesExplicitSimulatorRow = Boolean(
    simulatorRow && simulatorRowId && simulatorRow.id === simulatorRowId,
  );

  const simulatorPrice = usesExplicitSimulatorRow
    ? simulatorPriceInput ?? simulatorRow?.price ?? 0
    : simulatorRow?.price ?? 0;
  const simulatorCost = usesExplicitSimulatorRow
    ? simulatorCostInput ?? simulatorRow?.cost ?? 0
    : simulatorRow?.cost ?? 0;
  const simulatorFixedCosts = usesExplicitSimulatorRow
    ? simulatorFixedCostsInput ?? data?.breakEvenDefaults.fixedCosts ?? 0
    : data?.breakEvenDefaults.fixedCosts ?? 0;
  const simulatorUnits = usesExplicitSimulatorRow ? simulatorUnitsInput ?? 1 : 1;

  const simulatorBreakEven = useMemo(
    () =>
      calculateBreakEvenPoint({
        fixedCosts: simulatorFixedCosts,
        unitPrice: simulatorPrice,
        unitCost: simulatorCost,
      }),
    [simulatorCost, simulatorFixedCosts, simulatorPrice],
  );

  const simulatorUtility = useMemo(
    () => calculateUtility(simulatorPrice, simulatorCost),
    [simulatorCost, simulatorPrice],
  );

  const simulatorMarginPct = useMemo(
    () => calculateRealMarginPct(simulatorPrice, simulatorCost),
    [simulatorCost, simulatorPrice],
  );

  const projectedUtility = useMemo(
    () => simulatorUtility * Math.max(0, simulatorUnits),
    [simulatorUnits, simulatorUtility],
  );

  const costVsPriceChart = useMemo(
    () =>
      (data?.costVsPrice ?? []).map((row) => ({
        ...row,
        shortLabel: truncateLabel(row.label, 16),
      })),
    [data?.costVsPrice],
  );

  const utilityByRecordChart = useMemo(
    () =>
      (data?.utilityByRecord ?? []).map((row) => ({
        ...row,
        shortLabel: truncateLabel(row.label, 18),
      })),
    [data?.utilityByRecord],
  );

  const monthlyUtilityChart = useMemo(() => data?.monthlyUtility ?? [], [data?.monthlyUtility]);

  const columns = useMemo<ColumnDef<ProfitabilityOverview["rows"][number]>[]>(
    () => [
      {
        accessorKey: "label",
        header: "Producto / Proyecto",
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-slate-900">{row.original.label}</p>
            <p className="text-xs text-slate-500">
              {row.original.reference || "Sin referencia"}
              {row.original.category ? ` | ${row.original.category}` : ""}
            </p>
          </div>
        ),
      },
      {
        accessorKey: "source",
        header: "Origen",
        cell: ({ row }) => (row.original.source === "project" ? "Proyecto" : "Ecommerce"),
      },
      {
        accessorKey: "channel",
        header: "Canal",
        cell: ({ row }) => row.original.channel,
      },
      {
        accessorKey: "status",
        header: "Estado",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        accessorKey: "cost",
        header: "Costo",
        cell: ({ row }) => <CurrencyCell value={row.original.cost} />,
      },
      {
        accessorKey: "price",
        header: "Precio",
        cell: ({ row }) => <CurrencyCell value={row.original.price} />,
      },
      {
        accessorKey: "utility",
        header: "Ganancia",
        cell: ({ row }) => <CurrencyCell value={row.original.utility} />,
      },
      {
        accessorKey: "marginPct",
        header: "Margen",
        cell: ({ row }) => <PercentageBadge value={row.original.marginPct} decimals={1} />,
      },
      {
        accessorKey: "date",
        header: "Fecha",
        cell: ({ row }) => formatDateValue(row.original.date),
      },
    ],
    [],
  );

  if (isLoading) {
    return (
      <LoadingState
        title="Cargando rentabilidad"
        description="Consolidando proyectos, productos, snapshots y parametros del sistema..."
      />
    );
  }

  if (error) {
    return (
      <ErrorState
        description={error instanceof Error ? error.message : "No se pudo cargar la rentabilidad."}
        onRetry={() => void refetch()}
      />
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="Sin datos"
        description="No se encontro informacion para analizar rentabilidad."
      />
    );
  }

  return (
    <div className="space-y-4">
      <ModuleHeader
        title="Rentabilidad"
        description="Comparacion de costo, precio, utilidad y equilibrio sobre proyectos, productos y snapshots aprobados."
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            <RefreshCcw className={cn("mr-2 h-4 w-4", isFetching && "animate-spin")} />
            Actualizar
          </Button>
        }
      />

      <FilterBar
        search={
          <SearchInput
            className="w-full"
            value={filters.search || ""}
            onChange={(value) => setFilters((current) => ({ ...current, search: value }))}
            placeholder="Buscar por nombre, SKU, categoria o cliente"
          />
        }
        filters={
          <Select
            value={filters.source || "all"}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                source: event.target.value as ProfitabilitySourceFilter,
              }))
            }
            className="min-w-44"
          >
            <option value="all">Todos los origenes</option>
            <option value="project">Solo proyectos</option>
            <option value="ecommerce">Solo ecommerce</option>
          </Select>
        }
        actions={
          <Button type="button" variant="outline" onClick={() => setFilters(INITIAL_FILTERS)}>
            Limpiar filtros
          </Button>
        }
      />

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <KPIStatCard label="Ingresos analizados" value={data.summary.totalRevenue} />
        <KPIStatCard label="Costos analizados" value={data.summary.totalCost} />
        <KPIStatCard label="Ganancia estimada" value={data.summary.totalUtility} />
        <KPIStatCard label="Margen promedio" value={data.summary.averageMarginPct} format="number" suffix="%" />
        <KPIStatCard label="Proyectos" value={data.summary.projectCount} format="number" />
        <KPIStatCard label="Productos ecommerce" value={data.summary.ecommerceCount} format="number" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="Costo vs precio"
          description="Top registros por valor para detectar brecha entre costo y precio."
          contentClassName="h-[320px]"
        >
          {costVsPriceChart.length === 0 ? (
            <EmptyState
              title="Sin registros"
              description="No hay items rentables para graficar con los filtros actuales."
              className="h-full p-6"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costVsPriceChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="shortLabel" tickLine={false} axisLine={false} />
                <YAxis
                  width={110}
                  tickFormatter={(value) =>
                    formatCurrencyValue(Number(value), { maximumFractionDigits: 0 })
                  }
                />
                <Tooltip formatter={(value) => formatCurrencyValue(Number(value ?? 0))} />
                <Legend />
                <Bar dataKey="cost" name="Costo" fill="#94a3b8" radius={[8, 8, 0, 0]} />
                <Bar dataKey="price" name="Precio" fill="#0f172a" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard
          title="Ganancia por producto o proyecto"
          description="Ranking de utilidad por registro dentro del filtro actual."
          contentClassName="h-[320px]"
        >
          {utilityByRecordChart.length === 0 ? (
            <EmptyState
              title="Sin utilidades para mostrar"
              description="Ajusta los filtros o registra costos y precios para construir el ranking."
              className="h-full p-6"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={utilityByRecordChart} layout="vertical" margin={{ left: 32 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  tickFormatter={(value) =>
                    formatCurrencyValue(Number(value), { maximumFractionDigits: 0 })
                  }
                />
                <YAxis type="category" dataKey="shortLabel" width={120} />
                <Tooltip
                  formatter={(value, name, item) => {
                    const payload = item.payload as { marginPct: number };
                    return [
                      `${formatCurrencyValue(Number(value ?? 0))} | ${formatPercentValue(payload.marginPct, { digits: 1 })}`,
                      String(name),
                    ];
                  }}
                />
                <Bar dataKey="utility" name="Utilidad" radius={[0, 8, 8, 0]}>
                  {utilityByRecordChart.map((entry, index) => (
                    <Cell key={entry.label} fill={BAR_COLORS[index % BAR_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <SectionCard
          title="Composicion del costo"
          description="Materiales, mano de obra, logistica y cargos comerciales del universo filtrado."
          contentClassName="h-[320px]"
        >
          {data.costComposition.length === 0 ? (
            <EmptyState
              title="Sin composicion disponible"
              description="Todavia no hay costos suficientemente desagregados para esta vista."
              className="h-full p-6"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.costComposition} dataKey="value" nameKey="label" innerRadius={62} outerRadius={106}>
                  {data.costComposition.map((entry, index) => (
                    <Cell key={entry.label} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrencyValue(Number(value ?? 0))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard
          title="Margen por canal"
          description="Canales ecommerce simulados con parametros vigentes y proyectos a medida usando su snapshot actual."
          contentClassName="h-[320px]"
        >
          {data.channelMargins.length === 0 ? (
            <EmptyState
              title="Sin canales para analizar"
              description="Todavia no hay productos o proyectos suficientes para consolidar margenes por canal."
              className="h-full p-6"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data.channelMargins}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis
                  yAxisId="currency"
                  width={110}
                  tickFormatter={(value) =>
                    formatCurrencyValue(Number(value), { maximumFractionDigits: 0 })
                  }
                />
                <YAxis
                  yAxisId="percent"
                  orientation="right"
                  tickFormatter={(value) => `${formatNumberValue(Number(value), { digits: 0 })}%`}
                />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === "Margen") {
                      return [formatPercentValue(Number(value ?? 0), { digits: 1 }), String(name)];
                    }

                    return [formatCurrencyValue(Number(value ?? 0)), String(name)];
                  }}
                />
                <Legend />
                <Bar yAxisId="currency" dataKey="utility" name="Utilidad" fill="#0f172a" radius={[8, 8, 0, 0]} />
                <Line yAxisId="percent" type="monotone" dataKey="marginPct" name="Margen" stroke="#0f766e" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </SectionCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <SectionCard
          title="Ganancia aprobada por mes"
          description="Serie mensual basada en snapshots de presupuestos aprobados."
          contentClassName="h-[320px]"
        >
          {monthlyUtilityChart.length === 0 ? (
            <EmptyState
              title="Sin snapshots aprobados"
              description="No hay presupuestos aprobados que coincidan con el filtro actual."
              className="h-full p-6"
            />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthlyUtilityChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="monthLabel" tickLine={false} axisLine={false} />
                <YAxis
                  width={110}
                  tickFormatter={(value) =>
                    formatCurrencyValue(Number(value), { maximumFractionDigits: 0 })
                  }
                />
                <Tooltip formatter={(value) => formatCurrencyValue(Number(value ?? 0))} />
                <Legend />
                <Bar dataKey="revenue" name="Ingresos" fill="#94a3b8" radius={[8, 8, 0, 0]} />
                <Line dataKey="utility" name="Utilidad" stroke="#0f172a" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard
          title="Simuladores basicos"
          description="Punto de equilibrio y proyeccion rapida usando un registro base editable."
        >
          {data.rows.length === 0 ? (
            <EmptyState
              title="Sin base para simular"
              description="Necesitas al menos un proyecto o producto con costo y precio para usar el simulador."
            />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Registro base
                  </label>
                  <Select
                    value={simulatorRow?.id ?? ""}
                    onChange={(event) => {
                      const nextRow = data.rows.find((row) => row.id === event.target.value);
                      if (!nextRow) {
                        return;
                      }

                      setSimulatorRowId(nextRow.id);
                      setSimulatorPriceInput(nextRow.price);
                      setSimulatorCostInput(nextRow.cost);
                      setSimulatorFixedCostsInput(data.breakEvenDefaults.fixedCosts);
                      setSimulatorUnitsInput(1);
                    }}
                  >
                    {data.rows.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Unidades proyectadas
                  </label>
                  <Input
                    type="number"
                    min={1}
                    step="1"
                    value={simulatorUnits}
                    onChange={(event) => setSimulatorUnitsInput(Number(event.target.value || 0))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Precio unitario
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={simulatorPrice}
                    onChange={(event) => setSimulatorPriceInput(Number(event.target.value || 0))}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Costo unitario
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={simulatorCost}
                    onChange={(event) => setSimulatorCostInput(Number(event.target.value || 0))}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Costos fijos
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={simulatorFixedCosts}
                    onChange={(event) => setSimulatorFixedCostsInput(Number(event.target.value || 0))}
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Ganancia por unidad</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">
                    {formatCurrencyValue(simulatorUtility)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Margen real</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">
                    {formatPercentValue(simulatorMarginPct, { digits: 1 })}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Punto de equilibrio</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">
                    {simulatorBreakEven.breakEvenUnits === null
                      ? "No viable"
                      : `${formatNumberValue(simulatorBreakEven.breakEvenUnits, { digits: 0 })} u`}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Facturacion de equilibrio</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">
                    {simulatorBreakEven.breakEvenRevenue === null
                      ? "No viable"
                      : formatCurrencyValue(simulatorBreakEven.breakEvenRevenue)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 md:col-span-2 xl:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Ganancia proyectada</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">
                    {formatCurrencyValue(projectedUtility)}
                  </p>
                </div>
              </div>
            </div>
          )}
        </SectionCard>
      </section>

      <SectionCard
        title="Detalle de rentabilidad"
        description={`Listado consolidado para ${getSourceLabel(filters.source || "all").toLowerCase()} con costos y margenes calculados.`}
      >
        {data.rows.length === 0 ? (
          <EmptyState
            title="Sin registros para esta vista"
            description="Ajusta los filtros o carga costos y precios en proyectos y productos para poblar el analisis."
          />
        ) : (
          <DataGrid<ProfitabilityOverview["rows"][number]>
            data={data.rows}
            columns={columns}
            hideSearch
            toolbarSlot={<span className="text-xs text-slate-500">{data.rows.length} registros</span>}
          />
        )}
      </SectionCard>
    </div>
  );
}

