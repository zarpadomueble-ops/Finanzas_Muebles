"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { buildMonthlyFinanceSummary } from "@/domain/finances";
import { usePeriodFilter } from "@/hooks";
import {
  createFinancialTransactionRecord,
  getFinancialFormOptionsRecord,
  listFinancialTransactionRecords,
} from "@/features/finances/actions";
import { FinanceFormSchema, type FinanceFormInput } from "@/features/finances/schemas";
import type { FinanceTransactionRecord } from "@/features/finances/types";
import { ErrorState, LoadingState } from "@/components/feedback";
import { FilterBar, FormFieldWrapper, SearchInput } from "@/components/forms";
import { CurrencyCell, DataGrid } from "@/components/tables";
import { KPIStatCard, ModuleHeader, SectionCard, StatusBadge } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrencyValue, formatNumberValue } from "@/lib/format";

interface FinanceModuleFilters {
  search: string;
  type: "" | "income" | "expense";
  status: "" | "pending" | "paid" | "collected" | "void";
  category_id: string;
  client_id: string;
  supplier_id: string;
}

const DEFAULT_FILTERS: FinanceModuleFilters = {
  search: "",
  type: "",
  status: "",
  category_id: "",
  client_id: "",
  supplier_id: "",
};

function currentPeriodDate(year: number | "all", month: number | "all") {
  if (typeof year === "number" && typeof month === "number") {
    return `${year}-${String(month).padStart(2, "0")}-01`;
  }

  return new Date().toISOString().slice(0, 10);
}

function toMetricRecord(row: FinanceTransactionRecord) {
  return {
    id: row.id,
    type: row.type,
    amount_base: Number(row.amount_base || 0),
    amount: Number(row.amount || 0),
    status: row.status,
    period_key: row.period_key,
    month: row.month,
    year: row.year,
    record_date: row.record_date,
    description: row.description,
    category_label: row.category_label,
  };
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "No se pudo cargar el modulo de finanzas.";
}

export function FinancesModule() {
  const { filter, periodLabel } = usePeriodFilter();
  const [filters, setFilters] = useState<FinanceModuleFilters>(DEFAULT_FILTERS);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<FinanceFormInput>({
    resolver: zodResolver(FinanceFormSchema),
    defaultValues: {
      type: "expense",
      category_id: "",
      subcategory: "",
      description: "",
      amount: 0,
      currency: "ARS",
      exchange_rate_to_base: 1,
      payment_method: "transferencia",
      status: "pending",
      record_date: currentPeriodDate(filter.year, filter.month),
      client_id: "",
      supplier_id: "",
      custom_project_id: "",
      budget_id: "",
      notes: "",
    },
    mode: "onChange",
  });

  useEffect(() => {
    form.setValue("record_date", currentPeriodDate(filter.year, filter.month), {
      shouldDirty: false,
      shouldValidate: true,
    });
  }, [filter.month, filter.year, form]);

  const { data, error, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["finances-module", filter.period_key ?? filter.month, filter.year, filters],
    queryFn: async () => {
      const [transactions, options] = await Promise.all([
        listFinancialTransactionRecords({
          ...filter,
          ...filters,
          include_deleted: false,
        }),
        getFinancialFormOptionsRecord(),
      ]);

      return {
        transactions,
        options,
      };
    },
    staleTime: 60_000,
  });

  const summary = useMemo(
    () =>
      buildMonthlyFinanceSummary(
        (data?.transactions ?? []).map(toMetricRecord),
        filter,
      ),
    [data?.transactions, filter],
  );

  const onSubmit = form.handleSubmit(async (values) => {
    setIsSaving(true);
    setFeedback(null);

    try {
      await createFinancialTransactionRecord({
        ...values,
        subcategory: values.subcategory || null,
        payment_method: values.payment_method || null,
        client_id: values.client_id || null,
        supplier_id: values.supplier_id || null,
        custom_project_id: values.custom_project_id || null,
        budget_id: values.budget_id || null,
        notes: values.notes || null,
      });

      setFeedback({ type: "success", message: "Movimiento financiero creado correctamente." });
      form.reset({
        ...form.getValues(),
        description: "",
        amount: 0,
        notes: "",
      });
      await refetch();
    } catch (submitError) {
      setFeedback({ type: "error", message: getErrorMessage(submitError) });
    } finally {
      setIsSaving(false);
    }
  });

  const columns: ColumnDef<FinanceTransactionRecord>[] = [
    {
      accessorKey: "record_date",
      header: "Fecha",
      cell: ({ row }) => row.original.record_date,
    },
    {
      accessorKey: "type",
      header: "Tipo",
      cell: ({ row }) =>
        row.original.type === "income" ? (
          <StatusBadge status="approved" label="Ingreso" />
        ) : (
          <StatusBadge status="pending" label="Egreso" />
        ),
    },
    {
      accessorKey: "category_label",
      header: "Categoria",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-slate-900">{row.original.category_label}</p>
          <p className="text-xs text-slate-500">{row.original.subcategory ?? "Sin subcategoria"}</p>
        </div>
      ),
    },
    {
      accessorKey: "description",
      header: "Descripcion",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-slate-900">{row.original.description}</p>
          <p className="text-xs text-slate-500">
            {row.original.client?.nombre || row.original.supplier?.nombre || row.original.project?.nombre_proyecto || "-"}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "amount_base",
      header: "Monto base",
      cell: ({ row }) => (
        <CurrencyCell
          value={Number(row.original.amount_base || 0)}
          className={row.original.type === "income" ? "text-emerald-700" : "text-rose-700"}
        />
      ),
    },
  ];

  if (isLoading) {
    return <LoadingState title="Cargando finanzas" description="Armando caja mensual y movimientos..." />;
  }

  if (error) {
    return <ErrorState description={getErrorMessage(error)} onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-4">
      <ModuleHeader
        title="Finanzas"
        description={`Caja operativa, ingresos y egresos consolidados para ${periodLabel}.`}
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()} disabled={isFetching}>
            Actualizar
          </Button>
        }
      />

      {feedback ? (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KPIStatCard label="Ingresos del periodo" value={summary.totalIncome} />
        <KPIStatCard label="Egresos del periodo" value={summary.totalExpense} />
        <KPIStatCard label="Balance mensual" value={summary.monthlyBalance} />
        <KPIStatCard
          label="Margen"
          value={summary.marginPct}
          format="number"
          suffix="%"
          deltaPct={summary.variationPct ?? undefined}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <SectionCard
          title="Evolucion historica"
          description="Ingresos, egresos y balance por periodo contable."
          contentClassName="h-[320px]"
        >
          {summary.series.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No hay movimientos suficientes para construir la serie.</p>
          ) : (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
              <BarChart data={summary.series}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} />
                <YAxis tickFormatter={(value) => formatCurrencyValue(Number(value), { maximumFractionDigits: 0 })} />
                <Tooltip formatter={(value) => formatCurrencyValue(Number(value ?? 0))} />
                <Bar dataKey="income" name="Ingresos" fill="#0f766e" radius={[6, 6, 0, 0]} />
                <Bar dataKey="expense" name="Egresos" fill="#dc2626" radius={[6, 6, 0, 0]} />
                <Bar dataKey="balance" name="Balance" fill="#0f172a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard
          title="Top egresos"
          description="Categorias con mayor peso en el periodo seleccionado."
        >
          <div className="space-y-3">
            {summary.topExpenses.length === 0 ? (
              <p className="text-sm text-slate-500">Todavia no hay egresos cargados para este periodo.</p>
            ) : (
              summary.topExpenses.map((item) => (
                <div key={item.label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-900">{item.label}</p>
                    <p className="text-sm font-semibold text-slate-900">{formatCurrencyValue(item.value)}</p>
                  </div>
                </div>
              ))
            )}

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">Variacion vs mes anterior</p>
              <p className="mt-2 text-xl font-semibold text-slate-900">
                {summary.variationPct === null
                  ? "N/D"
                  : `${summary.variationPct > 0 ? "+" : ""}${formatNumberValue(summary.variationPct, { digits: 1 })}%`}
              </p>
            </div>
          </div>
        </SectionCard>
      </section>

      <FilterBar
        search={
          <SearchInput
            className="w-full"
            value={filters.search}
            onChange={(value) => setFilters((current) => ({ ...current, search: value }))}
            placeholder="Buscar por descripcion, categoria, cliente o proveedor"
          />
        }
        filters={
          <>
            <Select
              value={filters.type}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  type: event.target.value as FinanceModuleFilters["type"],
                }))
              }
              className="min-w-32"
            >
              <option value="">Todos los tipos</option>
              <option value="income">Ingresos</option>
              <option value="expense">Egresos</option>
            </Select>

            <Select
              value={filters.status}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as FinanceModuleFilters["status"],
                }))
              }
              className="min-w-32"
            >
              <option value="">Todos los estados</option>
              <option value="pending">Pendiente</option>
              <option value="paid">Pagado</option>
              <option value="collected">Cobrado</option>
              <option value="void">Anulado</option>
            </Select>

            <Select
              value={filters.category_id}
              onChange={(event) => setFilters((current) => ({ ...current, category_id: event.target.value }))}
              className="min-w-44"
            >
              <option value="">Todas las categorias</option>
              {(data?.options.categories ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>

            <Select
              value={filters.client_id}
              onChange={(event) => setFilters((current) => ({ ...current, client_id: event.target.value }))}
              className="min-w-44"
            >
              <option value="">Todos los clientes</option>
              {(data?.options.clients ?? []).map((client) => (
                <option key={client.id} value={client.id}>
                  {client.nombre}
                </option>
              ))}
            </Select>

            <Select
              value={filters.supplier_id}
              onChange={(event) => setFilters((current) => ({ ...current, supplier_id: event.target.value }))}
              className="min-w-44"
            >
              <option value="">Todos los proveedores</option>
              {(data?.options.suppliers ?? []).map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.nombre}
                </option>
              ))}
            </Select>
          </>
        }
        actions={
          <Button type="button" variant="outline" onClick={() => setFilters(DEFAULT_FILTERS)}>
            Limpiar filtros
          </Button>
        }
      />

      <SectionCard title="Movimientos" description="Listado operativo del periodo filtrado.">
        <DataGrid<FinanceTransactionRecord>
          data={data?.transactions ?? []}
          columns={columns}
          hideSearch
          toolbarSlot={
            <span className="text-xs text-slate-500">
              {data?.transactions.length ?? 0} movimientos
            </span>
          }
        />
      </SectionCard>

      <SectionCard
        title="Nuevo movimiento"
        description="Alta manual con periodo contable, categoria y vinculaciones opcionales."
      >
        <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={onSubmit}>
          <FormFieldWrapper label="Tipo" required error={form.formState.errors.type?.message}>
            <Select {...form.register("type")}>
              <option value="expense">Egreso</option>
              <option value="income">Ingreso</option>
            </Select>
          </FormFieldWrapper>

          <FormFieldWrapper label="Categoria" required error={form.formState.errors.category_id?.message}>
            <Select {...form.register("category_id")}>
              <option value="">Selecciona una categoria</option>
              {(data?.options.categories ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </FormFieldWrapper>

          <FormFieldWrapper label="Estado" required error={form.formState.errors.status?.message}>
            <Select {...form.register("status")}>
              <option value="pending">Pendiente</option>
              <option value="paid">Pagado</option>
              <option value="collected">Cobrado</option>
              <option value="void">Anulado</option>
            </Select>
          </FormFieldWrapper>

          <FormFieldWrapper label="Fecha" required error={form.formState.errors.record_date?.message}>
            <Input type="date" {...form.register("record_date")} />
          </FormFieldWrapper>

          <FormFieldWrapper
            label="Descripcion"
            required
            error={form.formState.errors.description?.message}
            className="md:col-span-2"
          >
            <Input {...form.register("description")} />
          </FormFieldWrapper>

          <FormFieldWrapper label="Subcategoria" error={form.formState.errors.subcategory?.message}>
            <Input {...form.register("subcategory")} />
          </FormFieldWrapper>

          <FormFieldWrapper label="Monto" required error={form.formState.errors.amount?.message}>
            <Input
              type="number"
              step="0.01"
              min={0}
              {...form.register("amount", {
                setValueAs: (value) => (value === "" ? 0 : Number(value)),
              })}
            />
          </FormFieldWrapper>

          <FormFieldWrapper label="Moneda" required error={form.formState.errors.currency?.message}>
            <Input {...form.register("currency")} maxLength={3} />
          </FormFieldWrapper>

          <FormFieldWrapper
            label="Cotizacion base"
            required
            error={form.formState.errors.exchange_rate_to_base?.message}
          >
            <Input
              type="number"
              step="0.0001"
              min={0.0001}
              {...form.register("exchange_rate_to_base", {
                setValueAs: (value) => (value === "" ? 1 : Number(value)),
              })}
            />
          </FormFieldWrapper>

          <FormFieldWrapper label="Metodo de pago" error={form.formState.errors.payment_method?.message}>
            <Input {...form.register("payment_method")} />
          </FormFieldWrapper>

          <FormFieldWrapper label="Cliente" error={form.formState.errors.client_id?.message}>
            <Select {...form.register("client_id")}>
              <option value="">Sin cliente</option>
              {(data?.options.clients ?? []).map((client) => (
                <option key={client.id} value={client.id}>
                  {client.nombre}
                </option>
              ))}
            </Select>
          </FormFieldWrapper>

          <FormFieldWrapper label="Proveedor" error={form.formState.errors.supplier_id?.message}>
            <Select {...form.register("supplier_id")}>
              <option value="">Sin proveedor</option>
              {(data?.options.suppliers ?? []).map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.nombre}
                </option>
              ))}
            </Select>
          </FormFieldWrapper>

          <FormFieldWrapper label="Proyecto" error={form.formState.errors.custom_project_id?.message}>
            <Select {...form.register("custom_project_id")}>
              <option value="">Sin proyecto</option>
              {(data?.options.projects ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.nombre_proyecto}
                </option>
              ))}
            </Select>
          </FormFieldWrapper>

          <FormFieldWrapper label="Presupuesto" error={form.formState.errors.budget_id?.message}>
            <Select {...form.register("budget_id")}>
              <option value="">Sin presupuesto</option>
              {(data?.options.budgets ?? []).map((budget) => (
                <option key={budget.id} value={budget.id}>
                  {budget.budget_number ?? budget.id.slice(0, 8).toUpperCase()}
                </option>
              ))}
            </Select>
          </FormFieldWrapper>

          <FormFieldWrapper
            label="Observaciones"
            error={form.formState.errors.notes?.message}
            className="md:col-span-2 xl:col-span-4"
          >
            <Textarea rows={3} {...form.register("notes")} />
          </FormFieldWrapper>

          <div className="md:col-span-2 xl:col-span-4 flex items-center gap-2">
            <Button type="submit" disabled={isSaving || !form.formState.isValid}>
              {isSaving ? "Guardando..." : "Crear movimiento"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                form.reset({
                  ...form.getValues(),
                  description: "",
                  amount: 0,
                  notes: "",
                })
              }
              disabled={isSaving}
            >
              Limpiar
            </Button>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}
