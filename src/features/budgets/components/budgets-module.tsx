"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { FileDown, Loader2, MessageCircle, Pencil, Plus, RefreshCcw, Save, Trash2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import {
  applyBudgetProjectDraftToForm,
  buildBudgetWhatsappPreviewText,
  calculateBudgetPreviewFromForm,
  createBudgetBundleRecord,
  createBudgetSourceContextFromDetail,
  createBudgetSourceContextFromProjectDraft,
  createEmptyBudgetFormInput,
  exportBudgetPdfPreview,
  getBudgetDetailRecord,
  listBudgetClientOptions,
  listBudgetProjectOptions,
  listBudgetRecords,
  mapBudgetDetailToFormInput,
  prepareBudgetFromProjectRecord,
  updateBudgetBundleRecord,
} from "@/features/budgets/actions";
import {
  BudgetBundleFormSchema,
  type BudgetBundleFormInput,
  type BudgetsQueryInput,
} from "@/features/budgets/schemas";
import type {
  BudgetClientOption,
  BudgetPreviewRecord,
  BudgetProjectOption,
  BudgetRecord,
  BudgetSourceContext,
} from "@/features/budgets/types";
import { BUDGET_STATUS_LABELS, BUDGET_STATUS_OPTIONS } from "@/services/budgets";
import { EmptyState, ErrorState, LoadingState, SaveIndicator } from "@/components/feedback";
import { FilterBar, FormFieldWrapper, SearchInput } from "@/components/forms";
import { PageHeader, SectionCard, StatusBadge } from "@/components/shared";
import { CurrencyCell, DataGrid } from "@/components/tables";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatCurrency, formatDate, formatPercent } from "@/lib/utils";

const INITIAL_FILTERS: BudgetsQueryInput = { search: "", status: "", client_id: "", include_deleted: false };

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ocurrio un error inesperado.";
}

function createLine(): BudgetBundleFormInput["items"][number] {
  return { concepto: "otro", descripcion: "Nueva linea", cantidad: 1, precio_unitario: 0 };
}

function baseForm(clientId?: string | null) {
  const next = createEmptyBudgetFormInput();
  if (clientId) next.client_id = clientId;
  return next;
}

function getDiscountLabel(preview: BudgetPreviewRecord) {
  if (preview.summary.discountAmount <= 0) return "Sin descuento";
  return preview.summary.discountType === "percent"
    ? `Descuento ${preview.summary.discountValue}%`
    : "Descuento fijo";
}

function getProfitTone(value: number | null) {
  if (value === null) return "secondary" as const;
  if (value >= 20) return "success" as const;
  if (value > 0) return "warning" as const;
  return "danger" as const;
}

export function BudgetsModule() {
  const searchParams = useSearchParams();
  const initialClientId = searchParams.get("client_id")?.trim() ?? "";
  const [budgets, setBudgets] = useState<BudgetRecord[]>([]);
  const [clients, setClients] = useState<BudgetClientOption[]>([]);
  const [projects, setProjects] = useState<BudgetProjectOption[]>([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);
  const [sourceContext, setSourceContext] = useState<BudgetSourceContext | null>(null);
  const [filters, setFilters] = useState<BudgetsQueryInput>({ ...INITIAL_FILTERS, client_id: initialClientId });
  const [isLoadingBudgets, setIsLoadingBudgets] = useState(true);
  const [isLoadingRefs, setIsLoadingRefs] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [copied, setCopied] = useState(false);

  const form = useForm<BudgetBundleFormInput>({
    resolver: zodResolver(BudgetBundleFormSchema),
    defaultValues: baseForm(initialClientId),
    mode: "onChange",
  });
  const itemsFieldArray = useFieldArray({ control: form.control, name: "items" });

  const debouncedSearch = useDebouncedValue(filters.search || "", 300);
  const effectiveFilters = useMemo(() => ({ ...filters, search: debouncedSearch }), [debouncedSearch, filters]);
  const selectedBudget = useMemo(
    () => budgets.find((budget) => budget.id === selectedBudgetId) ?? null,
    [budgets, selectedBudgetId],
  );
  const values = form.watch();
  const selectedClient = useMemo(
    () => clients.find((client) => client.id === values.client_id) ?? null,
    [clients, values.client_id],
  );
  const filteredProjects = useMemo(
    () => projects.filter((project) => !values.client_id || project.client_id === values.client_id),
    [projects, values.client_id],
  );
  const preview = useMemo(() => calculateBudgetPreviewFromForm(values, sourceContext), [sourceContext, values]);
  const whatsappText = useMemo(
    () =>
      buildBudgetWhatsappPreviewText({
        form: values,
        preview,
        clientName: selectedClient?.nombre ?? "Cliente",
      }),
    [preview, selectedClient?.nombre, values],
  );

  const loadReferences = useCallback(async () => {
    setIsLoadingRefs(true);
    setError(null);
    try {
      const [clientOptions, projectOptions] = await Promise.all([
        listBudgetClientOptions(),
        listBudgetProjectOptions(),
      ]);
      setClients(clientOptions);
      setProjects(projectOptions);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoadingRefs(false);
    }
  }, []);

  const loadBudgets = useCallback(async () => {
    setIsLoadingBudgets(true);
    setError(null);
    try {
      const records = await listBudgetRecords(effectiveFilters);
      setBudgets(records);
      if (selectedBudgetId && !records.some((budget) => budget.id === selectedBudgetId)) {
        setSelectedBudgetId(null);
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoadingBudgets(false);
    }
  }, [effectiveFilters, selectedBudgetId]);

  useEffect(() => {
    void loadReferences();
  }, [loadReferences]);

  useEffect(() => {
    void loadBudgets();
  }, [loadBudgets]);

  useEffect(() => {
    if (form.formState.isDirty && saveState === "saved") setSaveState("idle");
  }, [form.formState.isDirty, saveState]);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const startCreate = useCallback(() => {
    setSelectedBudgetId(null);
    setSourceContext(null);
    setFeedback(null);
    setSaveState("idle");
    form.reset(baseForm(filters.client_id || initialClientId));
  }, [filters.client_id, form, initialClientId]);

  const startEdit = useCallback(
    async (budgetId: string) => {
      setIsLoadingDetail(true);
      setFeedback(null);
      setSaveState("idle");
      try {
        const detail = await getBudgetDetailRecord(budgetId);
        if (!detail) throw new Error("No se encontro el presupuesto.");
        setSelectedBudgetId(detail.budget.id);
        setSourceContext(createBudgetSourceContextFromDetail(detail));
        form.reset(mapBudgetDetailToFormInput(detail));
      } catch (detailError) {
        setFeedback({ type: "error", message: getErrorMessage(detailError) });
      } finally {
        setIsLoadingDetail(false);
      }
    },
    [form],
  );

  const loadProjectDraft = useCallback(async () => {
    const projectId = values.custom_project_id?.trim();
    if (!projectId) {
      setFeedback({ type: "error", message: "Selecciona un proyecto para generar el presupuesto." });
      return;
    }
    setIsLoadingDraft(true);
    setFeedback(null);
    try {
      const draft = await prepareBudgetFromProjectRecord(projectId);
      setSourceContext(createBudgetSourceContextFromProjectDraft(draft));
      form.reset(applyBudgetProjectDraftToForm({ ...form.getValues(), source_label: draft.source_label }, draft));
      setSaveState("idle");
      setFeedback({ type: "success", message: "Se cargaron las lineas del proyecto y su snapshot." });
    } catch (draftError) {
      setFeedback({ type: "error", message: getErrorMessage(draftError) });
    } finally {
      setIsLoadingDraft(false);
    }
  }, [form, values.custom_project_id]);

  const onSubmit = form.handleSubmit(async (input) => {
    setIsSaving(true);
    setSaveState("saving");
    setFeedback(null);
    try {
      const saved = selectedBudgetId
        ? await updateBudgetBundleRecord(selectedBudgetId, input)
        : await createBudgetBundleRecord(input);
      setSelectedBudgetId(saved.budget.id);
      setSourceContext(createBudgetSourceContextFromDetail(saved));
      form.reset(mapBudgetDetailToFormInput(saved));
      setSaveState("saved");
      setFeedback({
        type: "success",
        message: selectedBudgetId ? "Presupuesto actualizado correctamente." : "Presupuesto creado correctamente.",
      });
      await loadBudgets();
    } catch (submitError) {
      setSaveState("error");
      setFeedback({ type: "error", message: getErrorMessage(submitError) });
    } finally {
      setIsSaving(false);
    }
  });

  const exportPdf = () =>
    exportBudgetPdfPreview({
      form: values,
      preview,
      clientName: selectedClient?.nombre ?? "Cliente",
      sourceLabel: values.source_label || "Manual",
    });

  const copyWhatsapp = async () => {
    try {
      await navigator.clipboard.writeText(whatsappText);
      setCopied(true);
    } catch {
      setFeedback({ type: "error", message: "No se pudo copiar el texto al portapapeles." });
    }
  };

  const columns: ColumnDef<BudgetRecord>[] = [
    {
      accessorKey: "budget_number",
      header: "Presupuesto",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-slate-900">{row.original.budget_number || row.original.id.slice(0, 8)}</p>
          <p className="text-xs text-slate-500">{formatDate(row.original.fecha_emision)}</p>
        </div>
      ),
    },
    {
      id: "client",
      header: "Cliente",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-slate-900">{row.original.client?.nombre || "Sin cliente"}</p>
          <p className="text-xs text-slate-500">
            {row.original.project?.nombre_proyecto || row.original.costs_snapshot_data?.source_label || "Manual"}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "estado",
      header: "Estado",
      cell: ({ row }) => <StatusBadge status={row.original.estado} label={BUDGET_STATUS_LABELS[row.original.estado]} />,
    },
    {
      id: "totals",
      header: "Total / Saldo",
      cell: ({ row }) => (
        <div>
          <CurrencyCell value={Number(row.original.total_snapshot || 0)} />
          <p className="text-xs text-slate-500">Saldo: {formatCurrency(Number(row.original.saldo_snapshot || 0))}</p>
        </div>
      ),
    },
    {
      id: "snapshot",
      header: "Snapshot costo",
      cell: ({ row }) => {
        const value = Number(row.original.costs_snapshot_data?.source_cost_total || 0);
        return value > 0 ? <CurrencyCell value={value} /> : <span className="text-slate-500">Manual</span>;
      },
    },
    {
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => (
        <Button
          type="button"
          size="icon"
          variant="ghost"
          aria-label="Editar presupuesto"
          onClick={() => void startEdit(row.original.id)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  if (isLoadingRefs && clients.length === 0 && projects.length === 0) {
    return <LoadingState title="Cargando presupuestos" description="Preparando clientes y proyectos..." />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Presupuestos"
        description="Generacion de presupuestos con snapshot de costos, descuento configurable, PDF y salida para WhatsApp."
        actions={
          <>
            <SaveIndicator state={saveState} />
            <Button type="button" variant="outline" onClick={startCreate} disabled={isSaving}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo
            </Button>
            <Button type="button" variant="outline" onClick={exportPdf} disabled={preview.summary.lines.length === 0}>
              <FileDown className="mr-2 h-4 w-4" />
              PDF
            </Button>
            <Button
              type="button"
              onClick={() => void onSubmit()}
              disabled={isSaving || isLoadingDetail || isLoadingDraft || !form.formState.isValid}
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Guardando..." : "Guardar"}
            </Button>
          </>
        }
      />

      {feedback ? (
        <div className={`rounded-lg border px-3 py-2 text-sm ${feedback.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{feedback.message}</div>
      ) : null}

      <FilterBar
        search={<SearchInput className="w-full" value={filters.search || ""} onChange={(search) => setFilters((current) => ({ ...current, search }))} placeholder="Buscar por numero, cliente o proyecto" />}
        filters={
          <>
            <Select value={filters.client_id || ""} onChange={(event) => setFilters((current) => ({ ...current, client_id: event.target.value }))} className="min-w-52">
              <option value="">Todos los clientes</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.nombre}</option>)}
            </Select>
            <Select value={filters.status || ""} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as BudgetsQueryInput["status"] }))} className="min-w-44">
              <option value="">Todos los estados</option>
              {BUDGET_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{BUDGET_STATUS_LABELS[status]}</option>)}
            </Select>
          </>
        }
        actions={<Button type="button" variant="outline" onClick={() => setFilters({ ...INITIAL_FILTERS, client_id: initialClientId })}>Limpiar filtros</Button>}
      />

      {error && !isLoadingBudgets ? <ErrorState description={error} onRetry={() => void loadBudgets()} /> : null}

      <SectionCard title="Listado de presupuestos" description="Selecciona un presupuesto para editarlo o crea uno nuevo.">
        {isLoadingBudgets ? (
          <LoadingState title="Cargando presupuestos" description="Consultando base de datos..." />
        ) : budgets.length === 0 ? (
          <EmptyState title="Sin presupuestos" description="Todavia no hay presupuestos con los filtros actuales." action={<Button type="button" onClick={startCreate}><Plus className="mr-2 h-4 w-4" />Crear presupuesto</Button>} />
        ) : (
          <DataGrid data={budgets} columns={columns} hideSearch toolbarSlot={<span className="text-xs text-slate-500">{budgets.length} resultados</span>} />
        )}
      </SectionCard>

      {isLoadingDetail ? <LoadingState title="Cargando detalle" description="Recuperando lineas y snapshots..." /> : null}

      <SectionCard title={selectedBudget ? `Editar: ${selectedBudget.budget_number || selectedBudget.id.slice(0, 8)}` : "Nuevo presupuesto"} description="Formulario editable con lineas manuales, origen por proyecto y resumen comercial.">
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Cliente" error={form.formState.errors.client_id?.message} required><Select {...form.register("client_id")}><option value="">Seleccionar cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.nombre}</option>)}</Select></Field>
                <Field label="Proyecto origen" error={form.formState.errors.custom_project_id?.message}><Select {...form.register("custom_project_id")}><option value="">Manual / sin proyecto</option>{values.custom_project_id && !filteredProjects.some((project) => project.id === values.custom_project_id) ? <option value={values.custom_project_id}>{values.source_label || "Proyecto vinculado"}</option> : null}{filteredProjects.map((project) => <option key={project.id} value={project.id}>{project.nombre}</option>)}</Select></Field>
                <Field label="Origen / referencia" error={form.formState.errors.source_label?.message}><Input {...form.register("source_label")} placeholder="Ej. Placard dormitorio" /></Field>
                <Field label="Fecha de emision" error={form.formState.errors.fecha_emision?.message} required><Input type="date" {...form.register("fecha_emision")} /></Field>
                <Field label="Validez hasta" error={form.formState.errors.fecha_validez?.message}><Input type="date" {...form.register("fecha_validez")} /></Field>
                <Field label="Estado" error={form.formState.errors.estado?.message} required><Select {...form.register("estado")}>{BUDGET_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{BUDGET_STATUS_LABELS[status]}</option>)}</Select></Field>
                <Field label="Moneda" error={form.formState.errors.moneda?.message} required><Input {...form.register("moneda")} /></Field>
                <Field label="Forma de pago" error={form.formState.errors.forma_pago?.message} className="md:col-span-2 xl:col-span-4"><Input {...form.register("forma_pago")} placeholder="50% de sena y saldo contra entrega" /></Field>
                <Field label="Tipo descuento" error={form.formState.errors.descuento_tipo?.message}><Select {...form.register("descuento_tipo")}><option value="fixed">Importe fijo</option><option value="percent">Porcentaje</option></Select></Field>
                <Field label="Descuento" error={form.formState.errors.descuento_valor?.message}><Input type="number" min={0} step="0.01" {...form.register("descuento_valor", { setValueAs: (value) => value === "" ? 0 : Number(value) })} /></Field>
                <Field label="Sena" error={form.formState.errors.sena?.message}><Input type="number" min={0} step="0.01" {...form.register("sena", { setValueAs: (value) => value === "" ? 0 : Number(value) })} /></Field>
                <Field label="Notas" error={form.formState.errors.notas?.message} className="md:col-span-2 xl:col-span-4"><Textarea rows={3} {...form.register("notas")} /></Field>
              </div>

              <SectionCard
                title="Lineas del presupuesto"
                description="Puedes generar desde proyecto y editar manualmente antes de guardar."
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => void loadProjectDraft()} disabled={isLoadingDraft}>
                      {isLoadingDraft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                      Generar desde proyecto
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => itemsFieldArray.append(createLine())}><Plus className="mr-2 h-4 w-4" />Agregar linea</Button>
                  </div>
                }
              >
                <Table>
                  <TableHeader><TableRow><TableHead>Concepto</TableHead><TableHead className="min-w-72">Descripcion</TableHead><TableHead>Cantidad</TableHead><TableHead>P. unitario</TableHead><TableHead>Subtotal</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
                  <TableBody>
                    {itemsFieldArray.fields.map((field, index) => {
                      const lineError = form.formState.errors.items?.[index];
                      return (
                        <TableRow key={field.id}>
                          <TableCell><Select {...form.register(`items.${index}.concepto`)}><option value="fabricacion">Fabricacion</option><option value="instalacion">Instalacion</option><option value="flete">Flete</option><option value="descuento">Descuento</option><option value="otro">Otro</option></Select>{lineError?.concepto?.message ? <p className="mt-1 text-xs text-rose-600">{lineError.concepto.message}</p> : null}</TableCell>
                          <TableCell><Input {...form.register(`items.${index}.descripcion`)} />{lineError?.descripcion?.message ? <p className="mt-1 text-xs text-rose-600">{lineError.descripcion.message}</p> : null}</TableCell>
                          <TableCell><Input type="number" min={0.0001} step="0.01" {...form.register(`items.${index}.cantidad`, { setValueAs: (value) => value === "" ? 1 : Number(value) })} />{lineError?.cantidad?.message ? <p className="mt-1 text-xs text-rose-600">{lineError.cantidad.message}</p> : null}</TableCell>
                          <TableCell><Input type="number" min={0} step="0.01" {...form.register(`items.${index}.precio_unitario`, { setValueAs: (value) => value === "" ? 0 : Number(value) })} />{lineError?.precio_unitario?.message ? <p className="mt-1 text-xs text-rose-600">{lineError.precio_unitario.message}</p> : null}</TableCell>
                          <TableCell className="font-medium text-slate-900">{formatCurrency(Number(preview.summary.lines[index]?.subtotal || 0))}</TableCell>
                          <TableCell><Button type="button" size="icon" variant="ghost" aria-label="Eliminar linea" onClick={() => itemsFieldArray.remove(index)} disabled={itemsFieldArray.fields.length <= 1}><Trash2 className="h-4 w-4" /></Button></TableCell>
                        </TableRow>
                      );
                    })}
                    {itemsFieldArray.fields.length === 0 ? <TableRow><TableCell colSpan={6} className="py-4 text-slate-500">Agrega al menos una linea para emitir el presupuesto.</TableCell></TableRow> : null}
                  </TableBody>
                </Table>
              </SectionCard>

              <SectionCard title="Vista previa" description="Resumen listo para exportar y compartir.">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
                    <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Presupuesto</p><h3 className="text-xl font-semibold text-slate-900">{selectedBudget?.budget_number || "Sin numeracion"}</h3><p className="mt-1 text-sm text-slate-600">{selectedClient?.nombre || "Selecciona un cliente"} | Emision {formatDate(values.fecha_emision)}</p></div>
                    <div className="text-right"><StatusBadge status={values.estado} label={BUDGET_STATUS_LABELS[values.estado]} /><p className="mt-2 text-sm text-slate-500">Validez: {values.fecha_validez ? formatDate(values.fecha_validez) : "-"}</p></div>
                  </div>
                  <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                    <Table><TableHeader><TableRow><TableHead>Concepto</TableHead><TableHead>Descripcion</TableHead><TableHead className="text-right">Cant.</TableHead><TableHead className="text-right">P. unitario</TableHead><TableHead className="text-right">Subtotal</TableHead></TableRow></TableHeader><TableBody>{preview.summary.lines.map((line, index) => <TableRow key={`${line.descripcion}-${index}`}><TableCell><Badge variant="secondary" className="capitalize">{line.concepto}</Badge></TableCell><TableCell>{line.descripcion}</TableCell><TableCell className="text-right">{line.cantidad}</TableCell><TableCell className="text-right">{formatCurrency(line.precioUnitario)}</TableCell><TableCell className="text-right font-medium text-slate-900">{formatCurrency(line.subtotal)}</TableCell></TableRow>)}</TableBody></Table>
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"><SummaryRow label="Subtotal" value={preview.summary.subtotal} /><SummaryRow label={getDiscountLabel(preview)} value={preview.summary.discountAmount} tone={preview.summary.discountAmount > 0 ? "warning" : "default"} /><SummaryRow label="Total" value={preview.summary.total} strong /><SummaryRow label="Sena" value={preview.summary.senia} /><SummaryRow label="Saldo" value={preview.summary.saldo} strong /><div className="border-t border-slate-200 pt-3 text-sm text-slate-600"><p><span className="text-slate-500">Forma de pago:</span> {values.forma_pago || "-"}</p><p className="mt-2"><span className="text-slate-500">Notas:</span> {values.notas || "-"}</p></div></div>
                  </div>
                </div>
              </SectionCard>
            </div>

            <div className="space-y-4">
              <SectionCard
                title="Resumen del calculo"
                description="Totales, snapshot de costos y margen estimado."
                actions={<Badge variant={getProfitTone(preview.profitability?.margenRealPct ?? null)}>{preview.profitability ? `Margen ${formatPercent(preview.profitability.margenRealPct, 2)}` : "Sin costo base"}</Badge>}
              >
                <div className="space-y-2 text-sm">
                  <SummaryRow label="Subtotal" value={preview.summary.subtotal} />
                  <SummaryRow label="Descuento" value={preview.summary.discountAmount} tone="warning" />
                  <SummaryRow label="Total" value={preview.summary.total} strong />
                  <SummaryRow label="Sena" value={preview.summary.senia} />
                  <SummaryRow label="Saldo" value={preview.summary.saldo} strong />
                  <SummaryRow label="Costo snapshot" value={sourceContext?.sourceCostTotal || 0} />
                  <SummaryRow label="Utilidad estimada" value={preview.profitability?.utilidad || 0} tone={preview.profitability && preview.profitability.utilidad >= 0 ? "success" : "danger"} />
                </div>
              </SectionCard>

              <SectionCard title="Snapshot del origen" description="El costo base queda guardado dentro del presupuesto.">
                <div className="space-y-2 text-sm text-slate-700">
                  <p><span className="text-slate-500">Tipo:</span> {sourceContext?.sourceType === "custom_project" ? "Proyecto a medida" : "Manual"}</p>
                  <p><span className="text-slate-500">Origen:</span> {values.source_label || sourceContext?.sourceLabel || "Manual"}</p>
                  <p><span className="text-slate-500">Proyecto vinculado:</span> {projects.find((project) => project.id === values.custom_project_id)?.nombre || "-"}</p>
                  <p><span className="text-slate-500">Costo base:</span> {formatCurrency(sourceContext?.sourceCostTotal || 0)}</p>
                  <p><span className="text-slate-500">Ultima actualizacion:</span> {selectedBudget ? formatDate(selectedBudget.updated_at) : "-"}</p>
                </div>
              </SectionCard>

              <SectionCard
                title="Salida WhatsApp"
                description="Texto listo para copiar o abrir en WhatsApp Web."
                actions={
                  <div className="flex items-center gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => void copyWhatsapp()}>{copied ? "Copiado" : "Copiar"}</Button>
                    <Button type="button" size="sm" onClick={() => window.open(`https://wa.me/?text=${encodeURIComponent(whatsappText)}`, "_blank", "noopener,noreferrer")}><MessageCircle className="mr-2 h-4 w-4" />Abrir</Button>
                  </div>
                }
              >
                <Textarea value={whatsappText} readOnly rows={12} className="min-h-[240px] bg-slate-50" />
              </SectionCard>
            </div>
          </div>
        </form>
      </SectionCard>
    </div>
  );
}

function Field({
  label,
  error,
  required,
  className,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <FormFieldWrapper label={label} error={error} required={required} className={className}>
      {children}
    </FormFieldWrapper>
  );
}

function SummaryRow({
  label,
  value,
  strong = false,
  tone = "default",
}: {
  label: string;
  value: number;
  strong?: boolean;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const toneClass =
    tone === "success" ? "text-emerald-700" : tone === "warning" ? "text-amber-700" : tone === "danger" ? "text-rose-700" : "text-slate-900";
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`${strong ? "font-semibold" : "font-medium"} ${toneClass}`}>{formatCurrency(value)}</span>
    </div>
  );
}
