
"use client";

import Link from "next/link";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarRange, GripVertical, Plus, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type DragEvent, type ReactNode } from "react";
import { useForm } from "react-hook-form";
import {
  applyBudgetOptionToForm,
  applyProjectOptionToForm,
  createEmptyJobFormInput,
  createJobBoardRecord,
  getJobBoardDetailRecord,
  listJobBudgetOptions,
  listJobClientOptions,
  listJobProjectOptions,
  listJobsBoardRecords,
  mapJobBoardDetailToFormInput,
  updateJobBoardRecord,
  updateJobBoardStatusRecord,
} from "@/features/jobs/actions";
import { JobBoardFormSchema, type JobBoardFormInput, type JobsQueryInput } from "@/features/jobs/schemas";
import type {
  JobBoardDateScope,
  JobBoardRecord,
  JobBoardViewMode,
  JobBudgetOption,
  JobClientOption,
  JobProjectOption,
} from "@/features/jobs/types";
import { JOB_BOARD_STATUS_LABELS, JOB_BOARD_STATUS_OPTIONS } from "@/services/jobs-board";
import { EmptyState, ErrorState, LoadingState, SaveIndicator } from "@/components/feedback";
import { FilterBar, FormFieldWrapper, SearchInput } from "@/components/forms";
import { PageHeader, SectionCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatCurrency, formatDate } from "@/lib/utils";

const INITIAL_FILTERS: JobsQueryInput = {
  search: "",
  status: "",
  client_id: "",
  date_scope: "all",
  view_mode: "kanban",
  include_deleted: false,
};

const DATE_SCOPE_LABELS: Record<JobBoardDateScope, string> = {
  all: "Todas",
  overdue: "Vencidas",
  today: "Hoy",
  next_7_days: "Proximos 7 dias",
  scheduled: "Con fecha",
  without_date: "Sin fecha",
};

const VIEW_MODE_LABELS: Record<JobBoardViewMode, string> = {
  kanban: "Kanban",
  date: "Por fecha",
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Ocurrio un error inesperado.";
}

function normalizeDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return value.includes("T") ? value.slice(0, 10) : value;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateIso: string, days: number) {
  const date = new Date(dateIso);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function computeBalance(monto: number, sena: number) {
  return Math.max(0, Number(monto || 0) - Number(sena || 0));
}

function compareJobs(left: JobBoardRecord, right: JobBoardRecord) {
  const leftDate = normalizeDate(left.fecha_prometida);
  const rightDate = normalizeDate(right.fecha_prometida);

  if (leftDate && rightDate && leftDate !== rightDate) {
    return leftDate.localeCompare(rightDate);
  }

  if (leftDate && !rightDate) {
    return -1;
  }

  if (!leftDate && rightDate) {
    return 1;
  }

  if (left.prioridad !== right.prioridad) {
    return left.prioridad - right.prioridad;
  }

  return right.updated_at.localeCompare(left.updated_at);
}

function matchesDateScope(record: JobBoardRecord, scope: JobBoardDateScope) {
  if (scope === "all") {
    return true;
  }

  const promisedDate = normalizeDate(record.fecha_prometida);
  const today = todayIso();
  const nextWeek = addDays(today, 7);

  if (scope === "without_date") {
    return !promisedDate;
  }

  if (scope === "scheduled") {
    return Boolean(promisedDate);
  }

  if (!promisedDate) {
    return false;
  }

  if (scope === "overdue") {
    return promisedDate < today;
  }

  if (scope === "today") {
    return promisedDate === today;
  }

  return promisedDate >= today && promisedDate <= nextWeek;
}

function buildDateGroups(records: JobBoardRecord[]) {
  const groups = new Map<string, JobBoardRecord[]>();

  records.forEach((record) => {
    const key = normalizeDate(record.fecha_prometida) ?? "Sin fecha";
    const current = groups.get(key) ?? [];
    current.push(record);
    groups.set(key, current);
  });

  return Array.from(groups.entries())
    .sort(([left], [right]) => {
      if (left === "Sin fecha") return 1;
      if (right === "Sin fecha") return -1;
      return left.localeCompare(right);
    })
    .map(([label, items]) => ({
      label,
      items: items.sort(compareJobs),
    }));
}

function getPriorityLabel(value: number) {
  if (value <= 1) return "Urgente";
  if (value === 2) return "Alta";
  if (value === 3) return "Media";
  if (value === 4) return "Baja";
  return "Backlog";
}

export function JobsBoardModule() {
  const [jobs, setJobs] = useState<JobBoardRecord[]>([]);
  const [clients, setClients] = useState<JobClientOption[]>([]);
  const [projects, setProjects] = useState<JobProjectOption[]>([]);
  const [budgets, setBudgets] = useState<JobBudgetOption[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [dragJobId, setDragJobId] = useState<string | null>(null);
  const [filters, setFilters] = useState<JobsQueryInput>(INITIAL_FILTERS);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [isLoadingReferences, setIsLoadingReferences] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isMovingJobId, setIsMovingJobId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const form = useForm<JobBoardFormInput>({
    resolver: zodResolver(JobBoardFormSchema),
    defaultValues: createEmptyJobFormInput(),
    mode: "onChange",
  });

  const debouncedSearch = useDebouncedValue(filters.search || "", 300);
  const effectiveFilters = useMemo<JobsQueryInput>(
    () => ({
      ...filters,
      search: debouncedSearch,
    }),
    [debouncedSearch, filters],
  );

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  );

  const values = form.watch();
  const computedBalance = useMemo(() => computeBalance(values.monto_snapshot, values.sena_snapshot), [values.monto_snapshot, values.sena_snapshot]);
  const filteredJobs = useMemo(
    () => jobs.filter((job) => matchesDateScope(job, (filters.date_scope ?? "all") as JobBoardDateScope)),
    [filters.date_scope, jobs],
  );

  const jobsByStatus = useMemo(
    () =>
      JOB_BOARD_STATUS_OPTIONS.reduce<Record<JobBoardRecord["estado"], JobBoardRecord[]>>((acc, status) => {
        acc[status] = filteredJobs.filter((job) => job.estado === status).sort(compareJobs);
        return acc;
      }, {} as Record<JobBoardRecord["estado"], JobBoardRecord[]>),
    [filteredJobs],
  );

  const dateGroups = useMemo(() => buildDateGroups(filteredJobs), [filteredJobs]);
  const selectedBudgetOption = useMemo(() => budgets.find((budget) => budget.id === values.budget_id) ?? null, [budgets, values.budget_id]);
  const selectedProjectOption = useMemo(() => projects.find((project) => project.id === values.custom_project_id) ?? null, [projects, values.custom_project_id]);
  const selectedClientOption = useMemo(() => clients.find((client) => client.id === values.client_id) ?? null, [clients, values.client_id]);
  const filteredProjects = useMemo(() => projects.filter((project) => !values.client_id || project.client_id === values.client_id), [projects, values.client_id]);
  const filteredBudgets = useMemo(() => budgets.filter((budget) => !values.client_id || budget.client_id === values.client_id), [budgets, values.client_id]);

  const loadReferences = useCallback(async () => {
    setIsLoadingReferences(true);
    setError(null);

    try {
      const [clientOptions, projectOptions, budgetOptions] = await Promise.all([
        listJobClientOptions(),
        listJobProjectOptions(),
        listJobBudgetOptions(),
      ]);

      setClients(clientOptions);
      setProjects(projectOptions);
      setBudgets(budgetOptions);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoadingReferences(false);
    }
  }, []);

  const loadJobs = useCallback(async () => {
    setIsLoadingJobs(true);
    setError(null);

    try {
      const records = await listJobsBoardRecords(effectiveFilters);
      setJobs(records);

      if (selectedJobId && !records.some((job) => job.id === selectedJobId)) {
        setSelectedJobId(null);
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoadingJobs(false);
    }
  }, [effectiveFilters, selectedJobId]);
  useEffect(() => {
    void loadReferences();
  }, [loadReferences]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    if (form.formState.isDirty && saveState === "saved") {
      setSaveState("idle");
    }
  }, [form.formState.isDirty, saveState]);

  const startCreate = useCallback(() => {
    setSelectedJobId(null);
    setFeedback(null);
    setSaveState("idle");
    form.reset(createEmptyJobFormInput(filters.client_id || ""));
  }, [filters.client_id, form]);

  const startEdit = useCallback(
    async (jobId: string) => {
      setIsLoadingDetail(true);
      setFeedback(null);
      setSaveState("idle");

      try {
        const detail = await getJobBoardDetailRecord(jobId);
        if (!detail) {
          throw new Error("No se encontro la obra.");
        }

        setSelectedJobId(detail.job.id);
        form.reset(mapJobBoardDetailToFormInput(detail));
      } catch (detailError) {
        setFeedback({ type: "error", message: getErrorMessage(detailError) });
      } finally {
        setIsLoadingDetail(false);
      }
    },
    [form],
  );

  const moveJobToStatus = useCallback(
    async (jobId: string, status: JobBoardRecord["estado"]) => {
      const previousJobs = jobs;

      setIsMovingJobId(jobId);
      setFeedback(null);
      setJobs((current) => current.map((job) => (job.id === jobId ? { ...job, estado: status } : job)));

      if (selectedJobId === jobId) {
        form.setValue("estado", status, { shouldDirty: true, shouldValidate: true });
      }

      try {
        const updated = await updateJobBoardStatusRecord(jobId, status);
        setJobs((current) => current.map((job) => (job.id === jobId ? updated : job)));
      } catch (moveError) {
        setJobs(previousJobs);
        if (selectedJobId === jobId) {
          const original = previousJobs.find((job) => job.id === jobId);
          if (original) {
            form.setValue("estado", original.estado, { shouldValidate: true });
          }
        }
        setFeedback({ type: "error", message: getErrorMessage(moveError) });
      } finally {
        setIsMovingJobId(null);
      }
    },
    [form, jobs, selectedJobId],
  );

  const onSubmit = form.handleSubmit(async (input) => {
    setIsSaving(true);
    setSaveState("saving");
    setFeedback(null);

    try {
      const saved = selectedJobId
        ? await updateJobBoardRecord(selectedJobId, input)
        : await createJobBoardRecord(input);

      setSelectedJobId(saved.id);
      form.reset({
        ...input,
        id: saved.id,
      });
      setSaveState("saved");
      setFeedback({
        type: "success",
        message: selectedJobId ? "Obra actualizada correctamente." : "Obra creada correctamente.",
      });
      await loadJobs();
    } catch (submitError) {
      setSaveState("error");
      setFeedback({ type: "error", message: getErrorMessage(submitError) });
    } finally {
      setIsSaving(false);
    }
  });

  const handleClientChange = (clientId: string) => {
    form.setValue("client_id", clientId, { shouldDirty: true, shouldValidate: true });

    const currentBudget = budgets.find((budget) => budget.id === values.budget_id);
    if (currentBudget?.client_id && currentBudget.client_id !== clientId) {
      form.setValue("budget_id", "", { shouldDirty: true, shouldValidate: true });
    }

    const currentProject = projects.find((project) => project.id === values.custom_project_id);
    if (currentProject?.client_id && currentProject.client_id !== clientId) {
      form.setValue("custom_project_id", "", { shouldDirty: true, shouldValidate: true });
    }
  };

  const handleBudgetChange = (budgetId: string) => {
    form.setValue("budget_id", budgetId, { shouldDirty: true, shouldValidate: true });

    if (!budgetId) {
      return;
    }

    const budget = budgets.find((option) => option.id === budgetId);
    if (!budget) {
      return;
    }

    const next = applyBudgetOptionToForm(form.getValues(), budget);
    Object.entries(next).forEach(([key, value]) => {
      form.setValue(key as keyof JobBoardFormInput, value as never, {
        shouldDirty: true,
        shouldValidate: true,
      });
    });
  };

  const handleProjectChange = (projectId: string) => {
    form.setValue("custom_project_id", projectId, { shouldDirty: true, shouldValidate: true });

    if (!projectId) {
      return;
    }

    const project = projects.find((option) => option.id === projectId);
    if (!project) {
      return;
    }

    const next = applyProjectOptionToForm(form.getValues(), project);
    Object.entries(next).forEach(([key, value]) => {
      form.setValue(key as keyof JobBoardFormInput, value as never, {
        shouldDirty: true,
        shouldValidate: true,
      });
    });
  };

  const handleDrop = async (event: DragEvent<HTMLDivElement>, status: JobBoardRecord["estado"]) => {
    event.preventDefault();

    if (!dragJobId) {
      return;
    }

    if (jobs.find((job) => job.id === dragJobId)?.estado === status) {
      setDragJobId(null);
      return;
    }

    await moveJobToStatus(dragJobId, status);
    setDragJobId(null);
  };

  if (isLoadingReferences && clients.length === 0) {
    return <LoadingState title="Cargando obras" description="Preparando clientes, proyectos y presupuestos..." />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tablero de Obras"
        description="Seguimiento operativo tipo Kanban desde cotizacion hasta cobro, con filtros, fechas y detalle de cada obra."
        actions={
          <>
            <SaveIndicator state={saveState} />
            <Button type="button" variant="outline" onClick={startCreate} disabled={isSaving}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva obra
            </Button>
            <Button type="button" onClick={() => void onSubmit()} disabled={isSaving || isLoadingDetail || !form.formState.isValid}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Guardando..." : "Guardar"}
            </Button>
          </>
        }
      />

      {feedback ? (
        <div className={`rounded-lg border px-3 py-2 text-sm ${feedback.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>
          {feedback.message}
        </div>
      ) : null}

      <FilterBar
        search={<SearchInput className="w-full" value={filters.search || ""} onChange={(search) => setFilters((current) => ({ ...current, search }))} placeholder="Buscar por cliente, obra, presupuesto o notas" />}
        filters={
          <>
            <Select value={filters.client_id || ""} onChange={(event) => setFilters((current) => ({ ...current, client_id: event.target.value }))} className="min-w-52">
              <option value="">Todos los clientes</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.nombre}</option>)}
            </Select>
            <Select value={filters.status || ""} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as JobsQueryInput["status"] }))} className="min-w-44">
              <option value="">Todos los estados</option>
              {JOB_BOARD_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{JOB_BOARD_STATUS_LABELS[status]}</option>)}
            </Select>
            <Select value={filters.date_scope || "all"} onChange={(event) => setFilters((current) => ({ ...current, date_scope: event.target.value as JobBoardDateScope }))} className="min-w-44">
              {Object.entries(DATE_SCOPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
            <Select value={filters.view_mode || "kanban"} onChange={(event) => setFilters((current) => ({ ...current, view_mode: event.target.value as JobBoardViewMode }))} className="min-w-36">
              {Object.entries(VIEW_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </Select>
          </>
        }
        actions={<Button type="button" variant="outline" onClick={() => setFilters(INITIAL_FILTERS)}>Limpiar filtros</Button>}
      />

      {error && !isLoadingJobs ? <ErrorState description={error} onRetry={() => void loadJobs()} /> : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <SectionCard
            title={filters.view_mode === "date" ? "Agenda de obras" : "Kanban de obras"}
            description={filters.view_mode === "date" ? "Vista cronologica por fecha prometida." : "Arrastra las tarjetas entre estados para actualizar el flujo."}
          >
            {isLoadingJobs ? (
              <LoadingState title="Cargando tablero" description="Consultando obras en Supabase..." />
            ) : filteredJobs.length === 0 ? (
              <EmptyState title="Sin obras" description="No hay obras para los filtros actuales." action={<Button type="button" onClick={startCreate}><Plus className="mr-2 h-4 w-4" />Crear obra</Button>} />
            ) : filters.view_mode === "date" ? (
              <div className="space-y-4">
                {dateGroups.map((group) => (
                  <div key={group.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2"><CalendarRange className="h-4 w-4 text-slate-500" /><p className="font-medium text-slate-900">{group.label === "Sin fecha" ? group.label : formatDate(group.label)}</p></div>
                      <Badge variant="secondary">{group.items.length} obras</Badge>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                      {group.items.map((job) => <JobCard key={job.id} job={job} isActive={selectedJobId === job.id} isDragging={dragJobId === job.id} isMoving={isMovingJobId === job.id} onSelect={() => void startEdit(job.id)} onDragStart={() => setDragJobId(job.id)} onDragEnd={() => setDragJobId(null)} />)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid gap-3 xl:grid-cols-7">
                {JOB_BOARD_STATUS_OPTIONS.map((status) => {
                  const items = jobsByStatus[status];
                  const total = items.reduce((acc, item) => acc + Number(item.monto_snapshot || 0), 0);
                  return (
                    <div key={status} className={`min-h-[420px] rounded-xl border p-3 ${dragJobId ? "border-slate-300 bg-slate-50" : "border-slate-200 bg-slate-50"}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => void handleDrop(event, status)}>
                      <div className="mb-3 space-y-1"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-slate-900">{JOB_BOARD_STATUS_LABELS[status]}</p><Badge variant="secondary">{items.length}</Badge></div><p className="text-xs text-slate-500">{formatCurrency(total)}</p></div>
                      <div className="space-y-3">
                        {items.map((job) => <JobCard key={job.id} job={job} isActive={selectedJobId === job.id} isDragging={dragJobId === job.id} isMoving={isMovingJobId === job.id} onSelect={() => void startEdit(job.id)} onDragStart={() => setDragJobId(job.id)} onDragEnd={() => setDragJobId(null)} />)}
                        {items.length === 0 ? <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-6 text-center text-xs text-slate-500">Soltar aqui</div> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          {isLoadingDetail ? <LoadingState title="Cargando detalle" description="Recuperando datos de la obra..." /> : null}

          <SectionCard title={selectedJob ? `Editar: ${selectedJob.titulo || "Obra"}` : "Nueva obra"} description="Detalle operativo, fechas, avance y relaciones con cliente, proyecto y presupuesto.">
            <form className="space-y-4" onSubmit={onSubmit}>
              <Field label="Cliente" error={form.formState.errors.client_id?.message} required><Select value={values.client_id} onChange={(event) => handleClientChange(event.target.value)}><option value="">Seleccionar cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.nombre}</option>)}</Select></Field>
              <Field label="Presupuesto relacionado"><Select value={values.budget_id || ""} onChange={(event) => handleBudgetChange(event.target.value)}><option value="">Sin presupuesto</option>{filteredBudgets.map((budget) => <option key={budget.id} value={budget.id}>{budget.budget_number} | {budget.client_nombre || "Sin cliente"}</option>)}</Select></Field>
              <Field label="Proyecto relacionado"><Select value={values.custom_project_id || ""} onChange={(event) => handleProjectChange(event.target.value)}><option value="">Sin proyecto</option>{filteredProjects.map((project) => <option key={project.id} value={project.id}>{project.nombre}</option>)}</Select></Field>
              <Field label="Titulo" error={form.formState.errors.titulo?.message} required><Input {...form.register("titulo")} /></Field>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Estado" error={form.formState.errors.estado?.message} required><Select {...form.register("estado")}>{JOB_BOARD_STATUS_OPTIONS.map((status) => <option key={status} value={status}>{JOB_BOARD_STATUS_LABELS[status]}</option>)}</Select></Field>
                <Field label="Prioridad" error={form.formState.errors.prioridad?.message} required><Select value={String(values.prioridad)} onChange={(event) => form.setValue("prioridad", Number(event.target.value), { shouldDirty: true, shouldValidate: true })}>{[1, 2, 3, 4, 5].map((priority) => <option key={priority} value={priority}>{priority} - {getPriorityLabel(priority)}</option>)}</Select></Field>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Monto" error={form.formState.errors.monto_snapshot?.message}><Input type="number" min={0} step="0.01" {...form.register("monto_snapshot", { setValueAs: (value) => value === "" ? 0 : Number(value) })} /></Field>
                <Field label="Sena" error={form.formState.errors.sena_snapshot?.message}><Input type="number" min={0} step="0.01" {...form.register("sena_snapshot", { setValueAs: (value) => value === "" ? 0 : Number(value) })} /></Field>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">Saldo calculado: <span className="font-semibold text-slate-900">{formatCurrency(computedBalance)}</span></div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Fecha prometida" error={form.formState.errors.fecha_prometida?.message}><Input type="date" {...form.register("fecha_prometida")} /></Field>
                <Field label="Avance %" error={form.formState.errors.avance_pct?.message}><Input type="number" min={0} max={100} step="1" {...form.register("avance_pct", { setValueAs: (value) => value === "" ? 0 : Number(value) })} /></Field>
                <Field label="Fecha inicio" error={form.formState.errors.fecha_inicio?.message}><Input type="date" {...form.register("fecha_inicio")} /></Field>
                <Field label="Fecha entrega" error={form.formState.errors.fecha_entrega?.message}><Input type="date" {...form.register("fecha_entrega")} /></Field>
              </div>
              <Field label="Notas" error={form.formState.errors.notas?.message}><Textarea rows={4} {...form.register("notas")} /></Field>
            </form>
          </SectionCard>

          <SectionCard title="Detalle de obra" description="Resumen economico y relaciones vinculadas.">
            <div className="space-y-2 text-sm">
              <SummaryRow label="Cliente" value={selectedClientOption?.nombre || "-"} />
              <SummaryRow label="Presupuesto" value={selectedBudgetOption?.budget_number || "-"} />
              <SummaryRow label="Proyecto" value={selectedProjectOption?.nombre || "-"} />
              <SummaryRow label="Monto" value={formatCurrency(values.monto_snapshot || 0)} />
              <SummaryRow label="Sena" value={formatCurrency(values.sena_snapshot || 0)} />
              <SummaryRow label="Saldo" value={formatCurrency(computedBalance)} strong />
              <SummaryRow label="Fecha prometida" value={values.fecha_prometida ? formatDate(values.fecha_prometida) : "-"} />
              <SummaryRow label="Avance" value={`${Number(values.avance_pct || 0).toFixed(0)}%`} />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {values.client_id ? <Link href={`/clientes/${values.client_id}`} className="inline-flex items-center rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Ver cliente</Link> : null}
              {values.client_id ? <Link href={`/presupuestos?client_id=${values.client_id}`} className="inline-flex items-center rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Ver presupuestos</Link> : null}
              <Link href="/proyectos" className="inline-flex items-center rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Ver proyectos</Link>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

function JobCard({ job, isActive, isDragging, isMoving, onSelect, onDragStart, onDragEnd }: { job: JobBoardRecord; isActive: boolean; isDragging: boolean; isMoving: boolean; onSelect: () => void; onDragStart: () => void; onDragEnd: () => void; }) {
  const promisedDate = normalizeDate(job.fecha_prometida);
  const balance = computeBalance(Number(job.monto_snapshot || 0), Number(job.sena_snapshot || 0));

  return (
    <button type="button" draggable onClick={onSelect} onDragStart={onDragStart} onDragEnd={onDragEnd} className={`w-full rounded-xl border bg-white p-3 text-left shadow-sm transition ${isActive ? "border-slate-900 ring-1 ring-slate-200" : "border-slate-200 hover:border-slate-300"} ${isDragging ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{job.titulo || "Obra sin titulo"}</p><p className="truncate text-xs text-slate-500">{job.client?.nombre || "Sin cliente"}</p></div><GripVertical className="h-4 w-4 shrink-0 text-slate-400" /></div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600"><Badge variant="secondary">{getPriorityLabel(job.prioridad)}</Badge>{job.budget?.budget_number ? <Badge variant="secondary">{job.budget.budget_number}</Badge> : null}{isMoving ? <Badge variant="warning">Moviendo...</Badge> : null}</div>
      <div className="mt-3 grid gap-1 text-xs text-slate-600"><p>Monto: {formatCurrency(Number(job.monto_snapshot || 0))}</p><p>Sena: {formatCurrency(Number(job.sena_snapshot || 0))}</p><p>Saldo: {formatCurrency(balance)}</p><p>Prometida: {promisedDate ? formatDate(promisedDate) : "Sin fecha"}</p></div>
      <div className="mt-3"><div className="mb-1 flex items-center justify-between text-[11px] text-slate-500"><span>Avance</span><span>{Number(job.avance_pct || 0).toFixed(0)}%</span></div><div className="h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-slate-900 transition-all" style={{ width: `${Math.min(100, Math.max(0, Number(job.avance_pct || 0)))}%` }} /></div></div>
    </button>
  );
}

function Field({ label, error, required, className, children }: { label: string; error?: string; required?: boolean; className?: string; children: ReactNode; }) {
  return <FormFieldWrapper label={label} error={error} required={required} className={className}>{children}</FormFieldWrapper>;
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean; }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-slate-500">{label}</span><span className={strong ? "font-semibold text-slate-900" : "font-medium text-slate-900"}>{value}</span></div>;
}
