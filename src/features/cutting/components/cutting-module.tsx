"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, Download, Pencil, Plus, RotateCcw, RotateCw, Save, Sparkles, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { buildCuttingLayoutSvg, type CuttingOptimizationResult } from "@/domain/cutting";
import {
  archiveCuttingRecord,
  createCuttingBundleRecord,
  createEmptyCuttingBundleInput,
  createEmptyCuttingPartInput,
  duplicateCuttingRecord,
  getCuttingDefaults,
  getCuttingDetailRecord,
  listCuttingMaterialOptions,
  listCuttingRecords,
  mapCuttingDetailToFormInput,
  optimizeCuttingBundleRecord,
  restoreCuttingRecord,
  updateCuttingBundleRecord,
} from "@/features/cutting/actions";
import {
  CuttingBundleFormSchema,
  type CuttingBundleFormInput,
  type CuttingPartLineInput,
  type CuttingQueryInput,
} from "@/features/cutting/schemas";
import type { CutJobRecord, CuttingMaterialOption } from "@/features/cutting/types";
import { CUT_JOB_STATUS_LABELS, CUT_JOB_STATUS_OPTIONS } from "@/services/cutting";
import { ConfirmDialog, ErrorState, LoadingState, SaveIndicator } from "@/components/feedback";
import { FilterBar, FormFieldWrapper, SearchInput } from "@/components/forms";
import { PageHeader, SectionCard, StatusBadge } from "@/components/shared";
import { DataGrid } from "@/components/tables";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { downloadText, formatCurrency, formatDate, formatMeasure, formatPercent } from "@/lib/utils";
import { CuttingLayoutViewer } from "./cutting-layout-viewer";

const INITIAL_FILTERS: CuttingQueryInput = {
  search: "",
  status: "",
  include_deleted: false,
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

function getStatusLabel(status: string) {
  const normalized = status.trim().toLowerCase();
  if (CUT_JOB_STATUS_OPTIONS.includes(normalized as (typeof CUT_JOB_STATUS_OPTIONS)[number])) {
    return CUT_JOB_STATUS_LABELS[normalized as (typeof CUT_JOB_STATUS_OPTIONS)[number]];
  }

  return status;
}

export function CutOptimizerModule() {
  const [jobs, setJobs] = useState<CutJobRecord[]>([]);
  const [materials, setMaterials] = useState<CuttingMaterialOption[]>([]);
  const [defaults, setDefaults] = useState<Awaited<ReturnType<typeof getCuttingDefaults>> | null>(null);
  const [filters, setFilters] = useState<CuttingQueryInput>(INITIAL_FILTERS);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [optimizationResult, setOptimizationResult] = useState<CuttingOptimizationResult | null>(null);
  const [layoutSvg, setLayoutSvg] = useState<string | null>(null);
  const [isLoadingReferences, setIsLoadingReferences] = useState(true);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [archiveTarget, setArchiveTarget] = useState<CutJobRecord | null>(null);
  const [hasInitializedForm, setHasInitializedForm] = useState(false);

  const form = useForm<CuttingBundleFormInput>({
    resolver: zodResolver(CuttingBundleFormSchema),
    defaultValues: createEmptyCuttingBundleInput(),
    mode: "onChange",
  });

  const partsFieldArray = useFieldArray({
    control: form.control,
    name: "parts",
    keyName: "fieldKey",
  });

  const debouncedSearch = useDebouncedValue(filters.search || "", 300);
  const effectiveFilters = useMemo<CuttingQueryInput>(
    () => ({
      ...filters,
      search: debouncedSearch,
    }),
    [debouncedSearch, filters],
  );

  const materialMap = useMemo(
    () => new Map(materials.map((material) => [material.id, material])),
    [materials],
  );

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  );

  const watchedJob = form.watch("job");
  const watchedParts = form.watch("parts") ?? [];
  const loadedRowsCount = watchedParts.length;
  const expandedPiecesCount = watchedParts.reduce(
    (total, part) => total + Math.max(0, Number(part?.cantidad || 0)),
    0,
  );
  const distinctMaterialsCount = new Set(
    watchedParts.map((part) => part?.material_id).filter((materialId): materialId is string => Boolean(materialId)),
  ).size;

  const loadReferences = useCallback(async () => {
    setIsLoadingReferences(true);
    setError(null);

    try {
      const [defaultsResult, materialsResult] = await Promise.all([
        getCuttingDefaults(),
        listCuttingMaterialOptions(),
      ]);

      setDefaults(defaultsResult);
      setMaterials(materialsResult);

      if (!hasInitializedForm) {
        const firstMaterial = materialsResult[0];
        form.reset(
          createEmptyCuttingBundleInput({
            ...defaultsResult,
            materialId: firstMaterial?.id,
            espesorMm: firstMaterial?.espesor_mm ?? null,
          }),
        );
        setHasInitializedForm(true);
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoadingReferences(false);
    }
  }, [form, hasInitializedForm]);

  const loadJobs = useCallback(async () => {
    setIsLoadingJobs(true);
    setError(null);

    try {
      const records = await listCuttingRecords(effectiveFilters);
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
    const firstMaterial = materials[0];
    form.reset(
      createEmptyCuttingBundleInput({
        kerfMm: defaults?.kerfMm,
        margenPerimetralMm: defaults?.margenPerimetralMm,
        desperdicioExtraPct: defaults?.desperdicioExtraPct,
        permitirRotacionDefault: defaults?.permitirRotacionDefault,
        vetaDefault: defaults?.vetaDefault,
        materialId: firstMaterial?.id,
        espesorMm: firstMaterial?.espesor_mm ?? null,
      }),
    );
    setSelectedJobId(null);
    setOptimizationResult(null);
    setLayoutSvg(null);
    setFeedback(null);
    setSaveState("idle");
  }, [defaults, form, materials]);

  const startEdit = useCallback(async (jobId: string) => {
    setIsLoadingDetail(true);
    setFeedback(null);
    setSaveState("idle");

    try {
      const detail = await getCuttingDetailRecord(jobId);
      if (!detail) {
        throw new Error("No se encontro el trabajo de corte.");
      }

      setSelectedJobId(detail.job.id);
      form.reset(mapCuttingDetailToFormInput(detail));
      setOptimizationResult(detail.result);

      if (detail.layoutSvg) {
        setLayoutSvg(detail.layoutSvg);
      } else if (detail.result) {
        const domainMaterials = new Map(
          materials.map((material) => [
            material.id,
            {
              id: material.id,
              codigo: material.codigo,
              nombre: material.nombre,
              unidad: material.unidad,
              costoUnitario: material.costo_unitario,
              areaM2: material.area_m2,
              largoMm: material.largo_mm,
              anchoMm: material.ancho_mm,
              espesorMm: material.espesor_mm,
            },
          ]),
        );
        setLayoutSvg(buildCuttingLayoutSvg(detail.result, domainMaterials));
      } else {
        setLayoutSvg(null);
      }
    } catch (detailError) {
      setFeedback({ type: "error", message: getErrorMessage(detailError) });
    } finally {
      setIsLoadingDetail(false);
    }
  }, [form, materials]);

  const addPart = useCallback(() => {
    const firstMaterial = materials[0];
    partsFieldArray.append(
      createEmptyCuttingPartInput({
        materialId: firstMaterial?.id,
        espesorMm: firstMaterial?.espesor_mm ?? null,
        allowRotation: watchedJob.permitir_rotacion_default,
        grainRequired: watchedJob.veta_default,
      }),
    );
    setSaveState("idle");
  }, [materials, partsFieldArray, watchedJob.permitir_rotacion_default, watchedJob.veta_default]);

  const rotatePart = useCallback((index: number) => {
    const current = form.getValues(`parts.${index}`);
    form.setValue(`parts.${index}.largo_mm`, current.ancho_mm, { shouldDirty: true, shouldValidate: true });
    form.setValue(`parts.${index}.ancho_mm`, current.largo_mm, { shouldDirty: true, shouldValidate: true });
    setSaveState("idle");
  }, [form]);

  const toggleBlocked = useCallback((index: number, checked: boolean) => {
    form.setValue(`parts.${index}.bloqueada`, checked, { shouldDirty: true, shouldValidate: true });
    setSaveState("idle");
  }, [form]);

  const updatePartMaterial = useCallback((index: number, materialId: string) => {
    form.setValue(`parts.${index}.material_id`, materialId, { shouldDirty: true, shouldValidate: true });
    const selectedMaterial = materialMap.get(materialId);
    if (selectedMaterial) {
      form.setValue(`parts.${index}.espesor_mm`, selectedMaterial.espesor_mm, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    setSaveState("idle");
  }, [form, materialMap]);

  const onSave = form.handleSubmit(async (values) => {
    setIsSaving(true);
    setSaveState("saving");
    setFeedback(null);

    try {
      const saved = selectedJobId
        ? await updateCuttingBundleRecord(selectedJobId, values)
        : await createCuttingBundleRecord(values);

      setSelectedJobId(saved.job.id);
      form.reset(mapCuttingDetailToFormInput(saved));
      setOptimizationResult(saved.result);
      setLayoutSvg(saved.layoutSvg);
      setSaveState("saved");
      setFeedback({
        type: "success",
        message: selectedJobId
          ? "Trabajo de corte actualizado correctamente."
          : "Trabajo de corte creado correctamente.",
      });
      await loadJobs();
    } catch (submitError) {
      setSaveState("error");
      setFeedback({ type: "error", message: getErrorMessage(submitError) });
    } finally {
      setIsSaving(false);
    }
  });

  const runOptimization = useCallback(async (forcedIteration?: number) => {
    const isValid = await form.trigger();
    if (!isValid) {
      setFeedback({ type: "error", message: "Corrige errores del formulario antes de optimizar." });
      return;
    }

    setIsSaving(true);
    setSaveState("saving");
    setFeedback(null);

    try {
      const values = form.getValues();
      const currentIteration =
        optimizationResult?.iteration ??
        (selectedJob?.status === "optimized" ? selectedJob.iteration_actual : 0);
      const optimized = await optimizeCuttingBundleRecord(values, {
        jobId: selectedJobId ?? values.job.id,
        iteration: forcedIteration ?? Math.max(1, currentIteration + 1),
      });

      setSelectedJobId(optimized.detail.job.id);
      form.reset(mapCuttingDetailToFormInput(optimized.detail));
      setOptimizationResult(optimized.result);
      setLayoutSvg(optimized.layoutSvg);
      setSaveState("saved");
      setFeedback({
        type: "success",
        message: forcedIteration ? "Reoptimizacion completada." : "Optimizacion completada.",
      });
      await loadJobs();
    } catch (optimizeError) {
      setSaveState("error");
      setFeedback({ type: "error", message: getErrorMessage(optimizeError) });
    } finally {
      setIsSaving(false);
    }
  }, [form, loadJobs, optimizationResult?.iteration, selectedJob?.iteration_actual, selectedJob?.status, selectedJobId]);

  const handleDuplicate = async (jobId: string) => {
    setIsSaving(true);
    setFeedback(null);
    setSaveState("saving");

    try {
      const duplicated = await duplicateCuttingRecord(jobId);
      setSelectedJobId(duplicated.job.id);
      form.reset(mapCuttingDetailToFormInput(duplicated));
      setOptimizationResult(duplicated.result);
      setLayoutSvg(duplicated.layoutSvg);
      setSaveState("saved");
      setFeedback({ type: "success", message: "Trabajo duplicado correctamente." });
      await loadJobs();
    } catch (duplicateError) {
      setSaveState("error");
      setFeedback({ type: "error", message: getErrorMessage(duplicateError) });
    } finally {
      setIsSaving(false);
    }
  };

  const confirmArchive = async () => {
    if (!archiveTarget) {
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      await archiveCuttingRecord(archiveTarget.id);
      setArchiveTarget(null);
      setFeedback({ type: "success", message: "Trabajo archivado correctamente." });
      if (selectedJobId === archiveTarget.id) {
        startCreate();
      }
      await loadJobs();
    } catch (archiveError) {
      setFeedback({ type: "error", message: getErrorMessage(archiveError) });
    } finally {
      setIsSaving(false);
    }
  };

  const restoreJob = async (jobId: string) => {
    setIsSaving(true);
    setFeedback(null);

    try {
      await restoreCuttingRecord(jobId);
      setFeedback({ type: "success", message: "Trabajo restaurado correctamente." });
      await loadJobs();
    } catch (restoreError) {
      setFeedback({ type: "error", message: getErrorMessage(restoreError) });
    } finally {
      setIsSaving(false);
    }
  };

  const exportLayout = useCallback(() => {
    if (!optimizationResult) {
      return;
    }

    const domainMaterials = new Map(
      materials.map((material) => [
        material.id,
        {
          id: material.id,
          codigo: material.codigo,
          nombre: material.nombre,
          unidad: material.unidad,
          costoUnitario: material.costo_unitario,
          areaM2: material.area_m2,
          largoMm: material.largo_mm,
          anchoMm: material.ancho_mm,
          espesorMm: material.espesor_mm,
        },
      ]),
    );

    const svg = layoutSvg || buildCuttingLayoutSvg(optimizationResult, domainMaterials);
    const filenameBase = `corte-${selectedJobId ?? "nuevo"}-iter-${optimizationResult.iteration}`;
    downloadText(`${filenameBase}.svg`, svg, "image/svg+xml");
    downloadText(`${filenameBase}.json`, JSON.stringify(optimizationResult, null, 2), "application/json");
  }, [layoutSvg, materials, optimizationResult, selectedJobId]);

  const columns: ColumnDef<CutJobRecord>[] = [
    {
      accessorKey: "nombre",
      header: "Trabajo",
      cell: ({ row }) => {
        const job = row.original;
        return (
          <div>
            <p className="font-medium text-slate-900">{job.nombre}</p>
            <p className="text-xs text-slate-500">
              Iteracion {job.iteration_actual} | {formatDate(job.updated_at)}
            </p>
          </div>
        );
      },
    },
    {
      id: "board",
      header: "Placas / Uso",
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium text-slate-900">{row.original.placas_necesarias_snapshot}</p>
          <p className="text-xs text-slate-500">
            {formatPercent(Number(row.original.aprovechamiento_pct_snapshot || 0), 2)}
          </p>
        </div>
      ),
    },
    {
      id: "cost",
      header: "Costo placas",
      cell: ({ row }) => formatCurrency(Number(row.original.costo_placas_snapshot || 0)),
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => (
        <StatusBadge status={row.original.status} label={getStatusLabel(row.original.status)} />
      ),
    },
    {
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => {
        const job = row.original;
        const isArchived = Boolean(job.deleted_at);
        return (
          <div className="flex items-center gap-1">
            <Button type="button" size="icon" variant="ghost" aria-label="Editar trabajo de corte" disabled={isSaving} onClick={() => void startEdit(job.id)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="ghost" aria-label="Duplicar trabajo de corte" disabled={isSaving} onClick={() => void handleDuplicate(job.id)}>
              <Copy className="h-4 w-4" />
            </Button>
            {isArchived ? (
              <Button type="button" size="icon" variant="ghost" aria-label="Restaurar trabajo de corte" disabled={isSaving} onClick={() => void restoreJob(job.id)}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" size="icon" variant="ghost" aria-label="Archivar trabajo de corte" disabled={isSaving} onClick={() => setArchiveTarget(job)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  if (isLoadingReferences && !defaults) {
    return <LoadingState title="Cargando optimizador de corte" description="Preparando parametros y materiales..." />;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Optimizador de Corte Industrial"
        description="Nesting de placas por material/espesor con kerf, veta, rotacion y layout SVG de produccion."
        actions={
          <>
            <SaveIndicator state={saveState} />
            <Button type="button" variant="outline" disabled={isSaving} onClick={startCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!selectedJobId || isSaving}
              onClick={() => selectedJobId && void handleDuplicate(selectedJobId)}
            >
              <Copy className="mr-2 h-4 w-4" />
              Duplicar
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving || !optimizationResult}
              onClick={exportLayout}
            >
              <Download className="mr-2 h-4 w-4" />
              Exportar
            </Button>
            <Button type="button" variant="outline" disabled={isSaving} onClick={startCreate}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Resetear
            </Button>
            <Button type="button" disabled={isSaving || !form.formState.isValid} onClick={() => void onSave()}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Procesando..." : "Guardar"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isSaving || !form.formState.isValid}
              onClick={() => void runOptimization()}
            >
              <Sparkles className="mr-2 h-4 w-4" />
              Optimizar
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={isSaving || !form.formState.isValid}
              onClick={() =>
                void runOptimization(Math.max(1, (optimizationResult?.iteration ?? selectedJob?.iteration_actual ?? 0) + 1))
              }
            >
              <RotateCw className="mr-2 h-4 w-4" />
              Reoptimizar
            </Button>
          </>
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

      <FilterBar
        search={
          <SearchInput
            className="w-full"
            value={filters.search || ""}
            onChange={(value) => setFilters((current) => ({ ...current, search: value }))}
            placeholder="Buscar por nombre o estado"
          />
        }
        filters={
          <>
            <Select
              value={filters.status || ""}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as CuttingQueryInput["status"],
                }))
              }
              className="min-w-44"
            >
              <option value="">Todos los estados</option>
              {CUT_JOB_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {CUT_JOB_STATUS_LABELS[status]}
                </option>
              ))}
            </Select>

            <div className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5">
              <Switch
                checked={Boolean(filters.include_deleted)}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    include_deleted: event.currentTarget.checked,
                  }))
                }
              />
              <span className="text-xs text-slate-600">Ver archivados</span>
            </div>
          </>
        }
        actions={
          <Button type="button" variant="outline" onClick={() => setFilters(INITIAL_FILTERS)}>
            Limpiar filtros
          </Button>
        }
      />

      {error && !isLoadingJobs ? <ErrorState description={error} onRetry={() => void loadJobs()} /> : null}

      <SectionCard title="Trabajos de corte" description="Listado historico de optimizaciones y snapshots de placas.">
        {isLoadingJobs ? (
          <LoadingState title="Cargando trabajos" description="Consultando Supabase..." />
        ) : (
          <DataGrid<CutJobRecord>
            data={jobs}
            columns={columns}
            hideSearch
            toolbarSlot={<span className="text-xs text-slate-500">{jobs.filter((job) => !job.deleted_at).length} activos</span>}
          />
        )}
      </SectionCard>

      {isLoadingDetail ? <LoadingState title="Cargando detalle" description="Recuperando piezas y layouts..." /> : null}

      <SectionCard
        title={selectedJob ? `Editar: ${selectedJob.nombre}` : "Nuevo trabajo de corte"}
        description="Definicion del trabajo, parametros y piezas por material/espesor."
      >
        <form className="space-y-4" onSubmit={onSave}>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,0.7fr)]">
                <SectionCard title="Panel de parametros de corte" description="Datos de placa, kerf, margen y reglas globales de nesting.">
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <FormFieldWrapper label="Nombre" required error={form.formState.errors.job?.nombre?.message} className="md:col-span-2 xl:col-span-4">
                      <Input {...form.register("job.nombre")} />
                    </FormFieldWrapper>
                    <FormFieldWrapper label="Largo placa (mm)" required error={form.formState.errors.job?.largo_placa_mm?.message}>
                      <Input
                        type="number"
                        min={1}
                        step="1"
                        {...form.register("job.largo_placa_mm", { setValueAs: (value) => Number(value || 0) })}
                      />
                    </FormFieldWrapper>
                    <FormFieldWrapper label="Ancho placa (mm)" required error={form.formState.errors.job?.ancho_placa_mm?.message}>
                      <Input
                        type="number"
                        min={1}
                        step="1"
                        {...form.register("job.ancho_placa_mm", { setValueAs: (value) => Number(value || 0) })}
                      />
                    </FormFieldWrapper>
                    <FormFieldWrapper label="Kerf (mm)" required error={form.formState.errors.job?.kerf_mm?.message}>
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        {...form.register("job.kerf_mm", { setValueAs: (value) => Number(value || 0) })}
                      />
                    </FormFieldWrapper>
                    <FormFieldWrapper label="Margen perimetral (mm)" required error={form.formState.errors.job?.margen_perimetral_mm?.message}>
                      <Input
                        type="number"
                        min={0}
                        step="1"
                        {...form.register("job.margen_perimetral_mm", { setValueAs: (value) => Number(value || 0) })}
                      />
                    </FormFieldWrapper>
                    <FormFieldWrapper label="Desperdicio extra (%)" required error={form.formState.errors.job?.desperdicio_extra_pct?.message}>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        {...form.register("job.desperdicio_extra_pct", { setValueAs: (value) => Number(value || 0) })}
                      />
                    </FormFieldWrapper>
                    <FormFieldWrapper label="Estado" className="md:col-span-2 xl:col-span-3" error={form.formState.errors.job?.status?.message}>
                      <Select {...form.register("job.status")}>
                        {CUT_JOB_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {CUT_JOB_STATUS_LABELS[status]}
                          </option>
                        ))}
                      </Select>
                    </FormFieldWrapper>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                      <Checkbox
                        checked={Boolean(watchedJob.permitir_rotacion_default)}
                        onChange={(event) =>
                          form.setValue("job.permitir_rotacion_default", event.currentTarget.checked, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                      />
                      Permitir rotacion por defecto
                    </label>

                    <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm">
                      <Checkbox
                        checked={Boolean(watchedJob.veta_default)}
                        onChange={(event) =>
                          form.setValue("job.veta_default", event.currentTarget.checked, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                      />
                      Veta obligatoria por defecto
                    </label>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Panel de carga de piezas"
                  description="Carga inicial, control de volumen y acciones rapidas antes de optimizar."
                  actions={
                    <Button type="button" size="sm" variant="secondary" onClick={addPart}>
                      <Plus className="mr-2 h-4 w-4" />
                      Agregar pieza
                    </Button>
                  }
                >
                  <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                    <InlineMetric label="Filas cargadas" value={String(loadedRowsCount)} />
                    <InlineMetric label="Piezas expandidas" value={String(expandedPiecesCount)} />
                    <InlineMetric label="Materiales" value={String(distinctMaterialsCount)} />
                  </div>

                  <div className="mt-3 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                    <p>La tabla editable permite rotar, bloquear y etiquetar cada pieza.</p>
                    <p>Usa reoptimizacion para probar otra iteracion sin perder el snapshot anterior.</p>
                  </div>
                </SectionCard>
              </div>

              <SectionCard
                title="Tabla editable de piezas"
                description="Piezas rectangulares con material, espesor, veta, bloqueo y observaciones."
                actions={
                  <Button type="button" size="sm" variant="secondary" onClick={addPart}>
                    <Plus className="mr-2 h-4 w-4" />
                    Agregar pieza
                  </Button>
                }
              >
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-44">Pieza</TableHead>
                        <TableHead>Cant.</TableHead>
                        <TableHead>Largo</TableHead>
                        <TableHead>Ancho</TableHead>
                        <TableHead className="min-w-52">Material</TableHead>
                        <TableHead>Espesor</TableHead>
                        <TableHead>Prio</TableHead>
                        <TableHead>Rot</TableHead>
                        <TableHead>Veta</TableHead>
                        <TableHead>Bloq</TableHead>
                        <TableHead>Canto</TableHead>
                        <TableHead>Obs.</TableHead>
                        <TableHead className="w-20" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partsFieldArray.fields.map((field, index) => {
                        const line = watchedParts[index] as CuttingPartLineInput | undefined;
                        const lineError = form.formState.errors.parts?.[index];
                        const selectedMaterial = line ? materialMap.get(line.material_id) : null;

                        return (
                          <TableRow key={field.fieldKey}>
                            <TableCell>
                              <Input {...form.register(`parts.${index}.pieza`)} />
                              {lineError?.pieza?.message ? (
                                <p className="mt-1 text-xs text-rose-600">{lineError.pieza.message}</p>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={1}
                                step="1"
                                {...form.register(`parts.${index}.cantidad`, {
                                  setValueAs: (value) => Number(value || 1),
                                })}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={1}
                                step="1"
                                {...form.register(`parts.${index}.largo_mm`, {
                                  setValueAs: (value) => Number(value || 0),
                                })}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={1}
                                step="1"
                                {...form.register(`parts.${index}.ancho_mm`, {
                                  setValueAs: (value) => Number(value || 0),
                                })}
                              />
                            </TableCell>
                            <TableCell>
                              <Select
                                value={line?.material_id || ""}
                                onChange={(event) => updatePartMaterial(index, event.target.value)}
                              >
                                <option value="">Seleccionar material</option>
                                {materials.map((material) => (
                                  <option key={material.id} value={material.id}>
                                    {material.codigo} - {material.nombre}
                                  </option>
                                ))}
                              </Select>
                              {selectedMaterial ? (
                                <p className="mt-1 text-xs text-slate-500">
                                  {selectedMaterial.unidad}
                                  {selectedMaterial.espesor_mm
                                    ? ` | ${formatMeasure(selectedMaterial.espesor_mm, 1)}`
                                    : ""}
                                </p>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                step="0.1"
                                {...form.register(`parts.${index}.espesor_mm`, {
                                  setValueAs: (value) => (value === "" ? null : Number(value)),
                                })}
                              />
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={1}
                                max={9}
                                step="1"
                                {...form.register(`parts.${index}.prioridad`, {
                                  setValueAs: (value) => Number(value || 3),
                                })}
                              />
                            </TableCell>
                            <TableCell>
                              <Checkbox
                                checked={Boolean(line?.rotacion_permitida)}
                                onChange={(event) =>
                                  form.setValue(
                                    `parts.${index}.rotacion_permitida`,
                                    event.currentTarget.checked,
                                    { shouldDirty: true, shouldValidate: true },
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Checkbox
                                checked={Boolean(line?.veta_obligatoria)}
                                onChange={(event) =>
                                  form.setValue(
                                    `parts.${index}.veta_obligatoria`,
                                    event.currentTarget.checked,
                                    { shouldDirty: true, shouldValidate: true },
                                  )
                                }
                              />
                            </TableCell>
                            <TableCell>
                              <Checkbox
                                checked={Boolean(line?.bloqueada)}
                                onChange={(event) => toggleBlocked(index, event.currentTarget.checked)}
                              />
                            </TableCell>
                            <TableCell>
                              <Input {...form.register(`parts.${index}.canto`)} />
                            </TableCell>
                            <TableCell>
                              <Input {...form.register(`parts.${index}.observacion`)} />
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  aria-label="Rotar pieza"
                                  onClick={() => rotatePart(index)}
                                  title="Rotar pieza"
                                >
                                  <RotateCw className="h-4 w-4" />
                                </Button>
                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  aria-label="Eliminar pieza"
                                  onClick={() => partsFieldArray.remove(index)}
                                  disabled={partsFieldArray.fields.length <= 1}
                                  title="Eliminar pieza"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </SectionCard>
            </div>

            <div className="space-y-4">
              <SectionCard title="Resumen del calculo" description="Indicadores financieros y tecnicos del corte actual.">
                <div className="space-y-2 text-sm">
                  <SummaryRow label="Placas necesarias" value={optimizationResult?.summary.boardsUsed ?? 0} unit="u" />
                  <SummaryRow
                    label="Aprovechamiento"
                    value={optimizationResult?.summary.aprovechamientoPct ?? 0}
                    unit="%"
                  />
                  <SummaryRow
                    label="Desperdicio"
                    value={optimizationResult?.summary.desperdicioPct ?? 0}
                    unit="%"
                  />
                  <SummaryRow
                    label="Costo de placas"
                    value={optimizationResult?.summary.costoPlacas ?? 0}
                  />
                  <SummaryRow
                    label="Metraje de canto"
                    value={optimizationResult?.summary.totalCantoMetros ?? 0}
                    unit="m"
                  />
                  <SummaryRow
                    label="Piezas sin ubicar"
                    value={optimizationResult?.summary.piezasSinUbicar ?? 0}
                    unit="u"
                  />
                </div>
              </SectionCard>

              <SectionCard title="Parametros activos" description="Configuracion usada por el nesting.">
                <div className="space-y-2 text-sm text-slate-700">
                  <p>
                    <span className="text-slate-500">Placa:</span>{" "}
                    {formatMeasure(watchedJob.largo_placa_mm || 0, 0)} x {formatMeasure(watchedJob.ancho_placa_mm || 0, 0)}
                  </p>
                  <p>
                    <span className="text-slate-500">Kerf:</span> {formatMeasure(watchedJob.kerf_mm || 0, 1)}
                  </p>
                  <p>
                    <span className="text-slate-500">Margen perimetral:</span>{" "}
                    {formatMeasure(watchedJob.margen_perimetral_mm || 0, 1)}
                  </p>
                  <p>
                    <span className="text-slate-500">Desperdicio extra:</span>{" "}
                    {formatPercent(watchedJob.desperdicio_extra_pct || 0, 2)}
                  </p>
                  <p>
                    <span className="text-slate-500">Piezas cargadas:</span> {watchedParts.length}
                  </p>
                  <p>
                    <span className="text-slate-500">Ultima actualizacion:</span>{" "}
                    {selectedJob ? formatDate(selectedJob.updated_at) : "-"}
                  </p>
                </div>
              </SectionCard>

              {selectedJob?.deleted_at ? (
                <SectionCard>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-slate-600">Este trabajo esta archivado.</p>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSaving}
                      onClick={() => void restoreJob(selectedJob.id)}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" />
                      Restaurar
                    </Button>
                  </div>
                </SectionCard>
              ) : null}
            </div>
          </div>
        </form>
      </SectionCard>

      <CuttingLayoutViewer result={optimizationResult} materialMap={materialMap} />

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archivar trabajo de corte"
        description={
          archiveTarget
            ? `El trabajo ${archiveTarget.nombre} dejara de aparecer en el listado activo.`
            : undefined
        }
        confirmLabel="Archivar"
        cancelLabel="Cancelar"
        variant="danger"
        isLoading={isSaving}
        onConfirm={() => void confirmArchive()}
        onCancel={() => setArchiveTarget(null)}
      />
    </div>
  );
}

function SummaryRow({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit?: "%" | "u" | "m";
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">
        {unit === "%"
          ? formatPercent(value, 2)
          : unit === "u"
            ? `${Math.round(value)} u`
            : unit === "m"
              ? `${value.toFixed(2)} m`
              : formatCurrency(value)}
      </span>
    </div>
  );
}

function InlineMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}
