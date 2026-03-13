"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, Pencil, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { calculateCustomProjectCost, type CostingGlobalSettingsInput } from "@/domain/costing";
import {
  archiveProjectRecord,
  buildDefaultProjectLaborLines,
  createEmptyProjectFormInput,
  createProjectBundleRecord,
  duplicateProjectRecord,
  getProjectCostingSettingsInput,
  getProjectDetailRecord,
  listProjectClientsOptions,
  listProjectMaterialsOptions,
  listProjectsRecords,
  mapProjectDetailToFormInput,
  restoreProjectRecord,
  updateProjectBundleRecord,
} from "@/features/projects/actions";
import {
  ProjectBundleFormSchema,
  type ProjectBundleFormInput,
  type ProjectsQueryInput,
} from "@/features/projects/schemas";
import type {
  ProjectClientOption,
  ProjectMaterialOption,
  ProjectRecord,
} from "@/features/projects/types";
import {
  PROJECT_PROCESS_LABELS,
  PROJECT_PROCESS_OPTIONS,
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_OPTIONS,
} from "@/services/projects";
import { ConfirmDialog, ErrorState, LoadingState, SaveIndicator } from "@/components/feedback";
import { FilterBar, FormFieldWrapper, SearchInput } from "@/components/forms";
import { PageHeader, SectionCard, StatusBadge } from "@/components/shared";
import { CurrencyCell, DataGrid } from "@/components/tables";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatCurrency, formatDate, formatMeasure, formatPercent } from "@/lib/utils";

const INITIAL_FILTERS: ProjectsQueryInput = {
  search: "",
  status: "",
  client_id: "",
  include_deleted: false,
};
const EMPTY_MATERIAL_LINES: ProjectBundleFormInput["materials"] = [];
const EMPTY_LABOR_LINES: ProjectBundleFormInput["labor"] = [];

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

function getMarginTone(realMarginPct: number, targetMarginPct: number) {
  if (realMarginPct >= targetMarginPct) {
    return "success" as const;
  }

  if (realMarginPct > 0) {
    return "warning" as const;
  }

  return "danger" as const;
}

function getProjectStatusLabel(status: string) {
  const normalized = status.trim().toLowerCase();
  if (PROJECT_STATUS_OPTIONS.includes(normalized as ProjectBundleFormInput["estado"])) {
    return PROJECT_STATUS_LABELS[normalized as ProjectBundleFormInput["estado"]];
  }

  return status;
}

function formatDimensionSummary(
  anchoMm: number | null | undefined,
  altoMm: number | null | undefined,
  profundidadMm: number | null | undefined,
) {
  const values = [anchoMm, altoMm, profundidadMm];
  if (values.every((value) => !value || value <= 0)) {
    return "-";
  }

  const width = anchoMm && anchoMm > 0 ? formatMeasure(anchoMm, 0) : "-";
  const height = altoMm && altoMm > 0 ? formatMeasure(altoMm, 0) : "-";
  const depth = profundidadMm && profundidadMm > 0 ? formatMeasure(profundidadMm, 0) : "-";

  return `${width} x ${height} x ${depth}`;
}

export function ProjectsCustomModule() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [clients, setClients] = useState<ProjectClientOption[]>([]);
  const [materialsCatalog, setMaterialsCatalog] = useState<ProjectMaterialOption[]>([]);
  const [costingSettings, setCostingSettings] = useState<CostingGlobalSettingsInput | null>(null);
  const [defaultCostHour, setDefaultCostHour] = useState<number | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ProjectsQueryInput>(INITIAL_FILTERS);
  const [isLoadingProjects, setIsLoadingProjects] = useState(true);
  const [isLoadingReferences, setIsLoadingReferences] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [archiveTarget, setArchiveTarget] = useState<ProjectRecord | null>(null);
  const [hasInitializedForm, setHasInitializedForm] = useState(false);

  const form = useForm<ProjectBundleFormInput>({
    resolver: zodResolver(ProjectBundleFormSchema),
    defaultValues: createEmptyProjectFormInput(),
    mode: "onChange",
  });

  const materialsFieldArray = useFieldArray({ control: form.control, name: "materials" });
  const laborFieldArray = useFieldArray({ control: form.control, name: "labor" });

  const debouncedSearch = useDebouncedValue(filters.search || "", 300);

  const effectiveFilters = useMemo<ProjectsQueryInput>(
    () => ({
      ...filters,
      search: debouncedSearch,
    }),
    [debouncedSearch, filters],
  );

  const materialsMap = useMemo(
    () => new Map(materialsCatalog.map((material) => [material.id, material])),
    [materialsCatalog],
  );

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const watchedValues = form.watch();
  const watchedMaterials = watchedValues.materials ?? EMPTY_MATERIAL_LINES;
  const watchedLabor = watchedValues.labor ?? EMPTY_LABOR_LINES;

  const costPreview = useMemo(() => {
    if (!costingSettings) {
      return null;
    }

    const materialInputs = watchedMaterials.map((line) => {
      const material = materialsMap.get(line.material_id);
      return {
        materialId: line.material_id || undefined,
        descripcion: material?.nombre || "Material",
        quantity: Number(line.consumo || 0),
        unitCost: Number(line.costo_unitario || 0),
        wastePct: Number(line.desperdicio_pct || 0),
      };
    });

    const laborInputs = watchedLabor.map((line) => ({
      processKey: line.proceso_key,
      processName: line.proceso_nombre || PROJECT_PROCESS_LABELS[line.proceso_key],
      hours: Number(line.horas || 0),
      hourlyCost: line.costo_hora ?? defaultCostHour ?? costingSettings.costoHoraTaller,
    }));

    return calculateCustomProjectCost({
      settings: costingSettings,
      materials: materialInputs,
      labor: laborInputs,
      targetPrice: watchedValues.precio_final_manual ?? null,
      marginPct: costingSettings.margenMedidaPct,
      applyGlobalMaterialWaste: true,
      includeCommercialCharges: true,
    });
  }, [costingSettings, defaultCostHour, materialsMap, watchedLabor, watchedMaterials, watchedValues.precio_final_manual]);

  const loadReferenceData = useCallback(async () => {
    setIsLoadingReferences(true);
    setError(null);

    try {
      const [clientsResult, materialsResult, settingsResult] = await Promise.all([
        listProjectClientsOptions(),
        listProjectMaterialsOptions(),
        getProjectCostingSettingsInput(),
      ]);

      setClients(clientsResult);
      setMaterialsCatalog(materialsResult);
      setCostingSettings(settingsResult.costing);
      setDefaultCostHour(settingsResult.costing.costoHoraTaller);

      if (!hasInitializedForm) {
        form.reset(
          createEmptyProjectFormInput({
            defaultCostHour: settingsResult.costing.costoHoraTaller,
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

  const loadProjects = useCallback(async () => {
    setIsLoadingProjects(true);
    setError(null);

    try {
      const records = await listProjectsRecords(effectiveFilters);
      setProjects(records);

      if (selectedProjectId && !records.some((project) => project.id === selectedProjectId)) {
        setSelectedProjectId(null);
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoadingProjects(false);
    }
  }, [effectiveFilters, selectedProjectId]);

  useEffect(() => {
    void loadReferenceData();
  }, [loadReferenceData]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (form.formState.isDirty && saveState === "saved") {
      setSaveState("idle");
    }
  }, [form.formState.isDirty, saveState]);

  const startCreate = useCallback(() => {
    setSelectedProjectId(null);
    setFeedback(null);
    setSaveState("idle");
    form.reset(createEmptyProjectFormInput({ defaultCostHour: defaultCostHour ?? null }));
  }, [defaultCostHour, form]);

  const startEdit = useCallback(
    async (projectId: string) => {
      setIsLoadingDetail(true);
      setFeedback(null);
      setSaveState("idle");

      try {
        const detail = await getProjectDetailRecord(projectId);
        if (!detail) {
          throw new Error("No se encontro el proyecto.");
        }

        setSelectedProjectId(detail.project.id);
        form.reset(mapProjectDetailToFormInput(detail, defaultCostHour));
      } catch (detailError) {
        setFeedback({ type: "error", message: getErrorMessage(detailError) });
      } finally {
        setIsLoadingDetail(false);
      }
    },
    [defaultCostHour, form],
  );

  const addMaterialLine = () => {
    const firstMaterial = materialsCatalog[0];
    materialsFieldArray.append({
      material_id: firstMaterial?.id ?? "",
      consumo: 1,
      desperdicio_pct: 0,
      costo_unitario: Number(firstMaterial?.costo_unitario || 0),
    });
    setSaveState("idle");
  };

  const addLaborLine = () => {
    laborFieldArray.append({
      proceso_key: "armado",
      proceso_nombre: PROJECT_PROCESS_LABELS.armado,
      horas: 0,
      costo_hora: defaultCostHour ?? 0,
    });
    setSaveState("idle");
  };

  const resetBaseProcesses = () => {
    laborFieldArray.replace(buildDefaultProjectLaborLines(defaultCostHour ?? null));
    setSaveState("idle");
  };

  const handleDuplicateProject = async (projectId: string) => {
    setIsSaving(true);
    setFeedback(null);
    setSaveState("saving");

    try {
      const duplicated = await duplicateProjectRecord(projectId);
      setSelectedProjectId(duplicated.project.id);
      form.reset(mapProjectDetailToFormInput(duplicated, defaultCostHour));
      setSaveState("saved");
      setFeedback({ type: "success", message: "Proyecto duplicado correctamente." });
      await loadProjects();
    } catch (duplicateError) {
      setSaveState("error");
      setFeedback({ type: "error", message: getErrorMessage(duplicateError) });
    } finally {
      setIsSaving(false);
    }
  };

  const confirmArchiveProject = async () => {
    if (!archiveTarget) {
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      await archiveProjectRecord(archiveTarget.id);
      setArchiveTarget(null);
      setFeedback({ type: "success", message: "Proyecto archivado correctamente." });

      if (selectedProjectId === archiveTarget.id) {
        startCreate();
      }

      await loadProjects();
    } catch (archiveError) {
      setFeedback({ type: "error", message: getErrorMessage(archiveError) });
    } finally {
      setIsSaving(false);
    }
  };

  const restoreProject = async (projectId: string) => {
    setIsSaving(true);
    setFeedback(null);

    try {
      await restoreProjectRecord(projectId);
      setFeedback({ type: "success", message: "Proyecto restaurado correctamente." });
      await loadProjects();
    } catch (restoreError) {
      setFeedback({ type: "error", message: getErrorMessage(restoreError) });
    } finally {
      setIsSaving(false);
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setIsSaving(true);
    setSaveState("saving");
    setFeedback(null);

    try {
      const saved = selectedProjectId
        ? await updateProjectBundleRecord(selectedProjectId, values)
        : await createProjectBundleRecord(values);

      setSelectedProjectId(saved.project.id);
      form.reset(mapProjectDetailToFormInput(saved, defaultCostHour));
      setSaveState("saved");
      setFeedback({
        type: "success",
        message: selectedProjectId ? "Proyecto actualizado correctamente." : "Proyecto creado correctamente.",
      });
      await loadProjects();
    } catch (submitError) {
      setSaveState("error");
      setFeedback({ type: "error", message: getErrorMessage(submitError) });
    } finally {
      setIsSaving(false);
    }
  });

  const columns: ColumnDef<ProjectRecord>[] = [
    {
      accessorKey: "nombre_proyecto",
      header: "Proyecto",
      cell: ({ row }) => {
        const project = row.original;
        return (
          <div>
            <p className="font-medium text-slate-900">{project.nombre_proyecto}</p>
            <p className="text-xs text-slate-500">
              {project.tipo_mueble || "Sin tipo"} | {formatDate(project.fecha)}
            </p>
          </div>
        );
      },
    },
    {
      id: "client",
      header: "Cliente",
      cell: ({ row }) => row.original.client?.nombre || "-",
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          label={getProjectStatusLabel(row.original.status)}
        />
      ),
    },
    {
      id: "costs",
      header: "Costo / Precio",
      cell: ({ row }) => {
        const project = row.original;
        return (
          <div>
            <CurrencyCell value={Number(project.costo_total || 0)} />
            <p className="text-xs text-slate-500">
              Precio: {formatCurrency(Number(project.precio_evaluado || project.precio_sugerido || 0))}
            </p>
          </div>
        );
      },
    },
    {
      id: "margin",
      header: "Margen",
      cell: ({ row }) => {
        const project = row.original;
        const tone = getMarginTone(
          project.margen_real_pct,
          project.costing_snapshot?.result.margenObjetivoPct ?? 0,
        );
        return <Badge variant={tone}>{formatPercent(project.margen_real_pct, 2)}</Badge>;
      },
    },
    {
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => {
        const project = row.original;
        const isArchived = Boolean(project.deleted_at);

        return (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Editar"
              disabled={isSaving}
              onClick={() => void startEdit(project.id)}
            >
              <Pencil className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Duplicar"
              disabled={isSaving}
              onClick={() => void handleDuplicateProject(project.id)}
            >
              <Copy className="h-4 w-4" />
            </Button>

            {isArchived ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Restaurar"
                disabled={isSaving}
                onClick={() => void restoreProject(project.id)}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Archivar"
                disabled={isSaving}
                onClick={() => setArchiveTarget(project)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  if (isLoadingReferences && !costingSettings) {
    return (
      <LoadingState
        title="Cargando proyectos a medida"
        description="Preparando clientes, materiales y parametros de costeo..."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Proyectos a Medida"
        description="Cotizador tecnico con materiales, procesos, snapshots de costo y margen en tiempo real."
        actions={
          <>
            <SaveIndicator state={saveState} />
            <Button type="button" variant="outline" onClick={startCreate} disabled={isSaving}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!selectedProjectId || isSaving}
              onClick={() => selectedProjectId && void handleDuplicateProject(selectedProjectId)}
            >
              <Copy className="mr-2 h-4 w-4" />
              Duplicar
            </Button>
            <Button
              type="button"
              onClick={() => void onSubmit()}
              disabled={isSaving || !form.formState.isValid || isLoadingDetail}
            >
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Guardando..." : "Guardar"}
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
            placeholder="Buscar por nombre, tipo o estado"
          />
        }
        filters={
          <>
            <Select
              value={filters.client_id || ""}
              onChange={(event) =>
                setFilters((current) => ({ ...current, client_id: event.target.value }))
              }
              className="min-w-52"
            >
              <option value="">Todos los clientes</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.nombre}
                </option>
              ))}
            </Select>

            <Select
              value={filters.status || ""}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as ProjectsQueryInput["status"],
                }))
              }
              className="min-w-44"
            >
              <option value="">Todos los estados</option>
              {PROJECT_STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {PROJECT_STATUS_LABELS[status]}
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

      {error && !isLoadingProjects ? <ErrorState description={error} onRetry={() => void loadProjects()} /> : null}

      <SectionCard title="Listado de proyectos" description="Selecciona un proyecto para editar o crea uno nuevo.">
        {isLoadingProjects ? (
          <LoadingState title="Cargando proyectos" description="Consultando base de datos..." />
        ) : (
          <DataGrid<ProjectRecord>
            data={projects}
            columns={columns}
            hideSearch
            toolbarSlot={
              <span className="text-xs text-slate-500">
                {projects.filter((project) => !project.deleted_at).length} activos
              </span>
            }
          />
        )}
      </SectionCard>

      {isLoadingDetail ? (
        <LoadingState title="Cargando detalle" description="Recuperando materiales y procesos del proyecto..." />
      ) : null}

      <SectionCard
        title={selectedProject ? `Editar: ${selectedProject.nombre_proyecto}` : "Nuevo proyecto"}
        description="Formulario principal, materiales y procesos con calculo automatico."
      >
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <FormFieldWrapper
                  label="Cliente"
                  required
                  error={form.formState.errors.client_id?.message}
                >
                  <Select {...form.register("client_id")}>
                    <option value="">Seleccionar cliente</option>
                    {clients.map((client) => (
                      <option key={client.id} value={client.id}>
                        {client.nombre}
                      </option>
                    ))}
                  </Select>
                </FormFieldWrapper>

                <FormFieldWrapper
                  label="Nombre del proyecto"
                  required
                  error={form.formState.errors.nombre_proyecto?.message}
                  className="md:col-span-2"
                >
                  <Input {...form.register("nombre_proyecto")} />
                </FormFieldWrapper>

                <FormFieldWrapper
                  label="Fecha"
                  required
                  error={form.formState.errors.fecha?.message}
                >
                  <Input type="date" {...form.register("fecha")} />
                </FormFieldWrapper>

                <FormFieldWrapper label="Tipo de mueble" error={form.formState.errors.tipo_mueble?.message}>
                  <Input {...form.register("tipo_mueble")} />
                </FormFieldWrapper>

                <FormFieldWrapper label="Ancho (mm)" error={form.formState.errors.ancho_mm?.message}>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    {...form.register("ancho_mm", {
                      setValueAs: (value) => (value === "" ? null : Number(value)),
                    })}
                  />
                </FormFieldWrapper>

                <FormFieldWrapper label="Alto (mm)" error={form.formState.errors.alto_mm?.message}>
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    {...form.register("alto_mm", {
                      setValueAs: (value) => (value === "" ? null : Number(value)),
                    })}
                  />
                </FormFieldWrapper>

                <FormFieldWrapper
                  label="Profundidad (mm)"
                  error={form.formState.errors.profundidad_mm?.message}
                >
                  <Input
                    type="number"
                    min={0}
                    step="1"
                    {...form.register("profundidad_mm", {
                      setValueAs: (value) => (value === "" ? null : Number(value)),
                    })}
                  />
                </FormFieldWrapper>

                <FormFieldWrapper label="Cantidad" required error={form.formState.errors.cantidad?.message}>
                  <Input
                    type="number"
                    min={1}
                    step="1"
                    {...form.register("cantidad", {
                      setValueAs: (value) => (value === "" ? 1 : Number(value)),
                    })}
                  />
                </FormFieldWrapper>

                <FormFieldWrapper label="Estado" required error={form.formState.errors.estado?.message}>
                  <Select {...form.register("estado")}>
                    {PROJECT_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {PROJECT_STATUS_LABELS[status]}
                      </option>
                    ))}
                  </Select>
                </FormFieldWrapper>

                <FormFieldWrapper
                  label="Precio final manual (opcional)"
                  error={form.formState.errors.precio_final_manual?.message}
                >
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    placeholder="Si se deja vacio usa precio sugerido"
                    {...form.register("precio_final_manual", {
                      setValueAs: (value) => (value === "" ? null : Number(value)),
                    })}
                  />
                </FormFieldWrapper>

                <FormFieldWrapper
                  label="Notas"
                  error={form.formState.errors.notas?.message}
                  className="md:col-span-2 xl:col-span-4"
                >
                  <Textarea rows={3} {...form.register("notas")} />
                </FormFieldWrapper>
              </div>

              <SectionCard
                title="Materiales del proyecto"
                description="Consumo, desperdicio y costo unitario con snapshot por linea."
                actions={
                  <Button type="button" size="sm" variant="secondary" onClick={addMaterialLine}>
                    <Plus className="mr-2 h-4 w-4" />
                    Agregar material
                  </Button>
                }
              >
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-56">Material</TableHead>
                        <TableHead>Consumo</TableHead>
                        <TableHead>Desperdicio %</TableHead>
                        <TableHead>Costo unit.</TableHead>
                        <TableHead>Subtotal</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {materialsFieldArray.fields.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="py-4 text-sm text-slate-500">
                            No hay materiales. Agrega al menos una linea para costear el proyecto.
                          </TableCell>
                        </TableRow>
                      ) : null}

                      {materialsFieldArray.fields.map((field, index) => {
                        const materialLine = watchedMaterials[index];
                        const selectedMaterial = materialLine
                          ? materialsMap.get(materialLine.material_id)
                          : null;
                        const previewLine = costPreview?.materials.lines[index];
                        const lineError = form.formState.errors.materials?.[index];

                        return (
                          <TableRow key={field.id}>
                            <TableCell>
                              <Select
                                value={materialLine?.material_id || ""}
                                onChange={(event) => {
                                  const materialId = event.target.value;
                                  form.setValue(`materials.${index}.material_id`, materialId, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                  });

                                  const material = materialsMap.get(materialId);
                                  if (!material) {
                                    return;
                                  }

                                  form.setValue(
                                    `materials.${index}.costo_unitario`,
                                    Number(material.costo_unitario || 0),
                                    {
                                      shouldDirty: true,
                                      shouldValidate: true,
                                    },
                                  );
                                }}
                              >
                                <option value="">Seleccionar material</option>
                                {materialsCatalog.map((material) => (
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
                              {lineError?.material_id?.message ? (
                                <p className="mt-1 text-xs text-rose-600">{lineError.material_id.message}</p>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                step="0.0001"
                                {...form.register(`materials.${index}.consumo`, {
                                  setValueAs: (value) => (value === "" ? 0 : Number(value)),
                                })}
                              />
                              {lineError?.consumo?.message ? (
                                <p className="mt-1 text-xs text-rose-600">{lineError.consumo.message}</p>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                step="0.01"
                                {...form.register(`materials.${index}.desperdicio_pct`, {
                                  setValueAs: (value) => (value === "" ? 0 : Number(value)),
                                })}
                              />
                              {lineError?.desperdicio_pct?.message ? (
                                <p className="mt-1 text-xs text-rose-600">{lineError.desperdicio_pct.message}</p>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                {...form.register(`materials.${index}.costo_unitario`, {
                                  setValueAs: (value) => (value === "" ? 0 : Number(value)),
                                })}
                              />
                              {lineError?.costo_unitario?.message ? (
                                <p className="mt-1 text-xs text-rose-600">{lineError.costo_unitario.message}</p>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-sm font-medium text-slate-900">
                              {formatCurrency(Number(previewLine?.totalSubtotal || 0))}
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => materialsFieldArray.remove(index)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </SectionCard>

              <SectionCard
                title="Procesos y mano de obra"
                description="Horas por proceso con costo/hora configurable."
                actions={
                  <div className="flex items-center gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={resetBaseProcesses}>
                      Procesos base
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={addLaborLine}>
                      <Plus className="mr-2 h-4 w-4" />
                      Agregar proceso
                    </Button>
                  </div>
                }
              >
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-44">Proceso</TableHead>
                        <TableHead>Nombre visible</TableHead>
                        <TableHead>Horas</TableHead>
                        <TableHead>Costo/hora</TableHead>
                        <TableHead>Subtotal</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {laborFieldArray.fields.map((field, index) => {
                        const laborLine = watchedLabor[index];
                        const previewLine = costPreview?.labor.lines[index];
                        const lineError = form.formState.errors.labor?.[index];

                        return (
                          <TableRow key={field.id}>
                            <TableCell>
                              <Select
                                value={laborLine?.proceso_key || "diseno"}
                                onChange={(event) => {
                                  const processKey = event.target.value as (typeof PROJECT_PROCESS_OPTIONS)[number];
                                  form.setValue(`labor.${index}.proceso_key`, processKey, {
                                    shouldDirty: true,
                                    shouldValidate: true,
                                  });
                                  form.setValue(
                                    `labor.${index}.proceso_nombre`,
                                    PROJECT_PROCESS_LABELS[processKey],
                                    {
                                      shouldDirty: true,
                                      shouldValidate: true,
                                    },
                                  );
                                }}
                              >
                                {PROJECT_PROCESS_OPTIONS.map((processKey) => (
                                  <option key={processKey} value={processKey}>
                                    {PROJECT_PROCESS_LABELS[processKey]}
                                  </option>
                                ))}
                              </Select>
                              {lineError?.proceso_key?.message ? (
                                <p className="mt-1 text-xs text-rose-600">{lineError.proceso_key.message}</p>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <Input
                                placeholder="Nombre en presupuesto"
                                {...form.register(`labor.${index}.proceso_nombre`)}
                              />
                              {lineError?.proceso_nombre?.message ? (
                                <p className="mt-1 text-xs text-rose-600">{lineError.proceso_nombre.message}</p>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                {...form.register(`labor.${index}.horas`, {
                                  setValueAs: (value) => (value === "" ? 0 : Number(value)),
                                })}
                              />
                              {lineError?.horas?.message ? (
                                <p className="mt-1 text-xs text-rose-600">{lineError.horas.message}</p>
                              ) : null}
                            </TableCell>
                            <TableCell>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                {...form.register(`labor.${index}.costo_hora`, {
                                  setValueAs: (value) =>
                                    value === "" ? defaultCostHour ?? 0 : Number(value),
                                })}
                              />
                              {lineError?.costo_hora?.message ? (
                                <p className="mt-1 text-xs text-rose-600">{lineError.costo_hora.message}</p>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-sm font-medium text-slate-900">
                              {formatCurrency(Number(previewLine?.subtotal || 0))}
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={() => laborFieldArray.remove(index)}
                                disabled={laborFieldArray.fields.length <= 1}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
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
              <SectionCard
                title="Resumen economico"
                description="Calculo en tiempo real conectado al motor de costos."
                actions={
                  costPreview ? (
                    <Badge variant={getMarginTone(costPreview.margenRealPct, costPreview.margenObjetivoPct)}>
                      Margen real {formatPercent(costPreview.margenRealPct, 2)}
                    </Badge>
                  ) : null
                }
              >
                <div className="space-y-2 text-sm">
                  <SummaryRow label="Subtotal materiales" value={costPreview?.subtotalMateriales || 0} />
                  <SummaryRow label="Horas totales" value={costPreview?.horasTotales || 0} unit="h" />
                  <SummaryRow label="Costo mano de obra" value={costPreview?.costoManoObra || 0} />
                  <SummaryRow label="Costo directo" value={costPreview?.costoDirecto || 0} />
                  <SummaryRow label="Cargos comerciales" value={costPreview?.costoCargosComerciales || 0} />
                  <SummaryRow label="Costo total" value={costPreview?.costoTotal || 0} strong />
                  <SummaryRow
                    label={`Margen objetivo (${formatPercent(costPreview?.margenObjetivoPct || 0, 2)})`}
                    value={costPreview?.precioSugerido || 0}
                  />
                  <SummaryRow label="Precio sugerido" value={costPreview?.precioSugerido || 0} strong />
                  <SummaryRow
                    label="Precio evaluado"
                    value={costPreview?.precioEvaluado || 0}
                    strong={Boolean(watchedValues.precio_final_manual)}
                  />
                  <SummaryRow
                    label="Utilidad"
                    value={costPreview?.utilidad || 0}
                    tone={(costPreview?.utilidad || 0) >= 0 ? "success" : "danger"}
                  />
                </div>
              </SectionCard>

              <SectionCard title="Resumen tecnico" description="Datos de fabricacion del proyecto.">
                <div className="space-y-2 text-sm text-slate-700">
                  <p>
                    <span className="text-slate-500">Dimensiones:</span>{" "}
                    {formatDimensionSummary(
                      watchedValues.ancho_mm,
                      watchedValues.alto_mm,
                      watchedValues.profundidad_mm,
                    )}
                  </p>
                  <p>
                    <span className="text-slate-500">Cantidad:</span> {watchedValues.cantidad || 0}
                  </p>
                  <p>
                    <span className="text-slate-500">Materiales:</span> {watchedMaterials.length}
                  </p>
                  <p>
                    <span className="text-slate-500">Procesos:</span> {watchedLabor.length}
                  </p>
                  <p>
                    <span className="text-slate-500">Costo/hora base:</span>{" "}
                    {formatCurrency(defaultCostHour || 0)}
                  </p>
                  <p>
                    <span className="text-slate-500">Ultima actualizacion:</span>{" "}
                    {selectedProject ? formatDate(selectedProject.updated_at) : "-"}
                  </p>
                </div>
              </SectionCard>

              {selectedProject?.deleted_at ? (
                <SectionCard>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-slate-600">Este proyecto esta archivado.</p>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={isSaving}
                      onClick={() => void restoreProject(selectedProject.id)}
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

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archivar proyecto"
        description={
          archiveTarget
            ? `El proyecto ${archiveTarget.nombre_proyecto} dejara de aparecer en el listado activo.`
            : undefined
        }
        confirmLabel="Archivar"
        cancelLabel="Cancelar"
        variant="danger"
        isLoading={isSaving}
        onConfirm={() => void confirmArchiveProject()}
        onCancel={() => setArchiveTarget(null)}
      />
    </div>
  );
}

function SummaryRow({
  label,
  value,
  unit,
  strong = false,
  tone = "default",
}: {
  label: string;
  value: number;
  unit?: string;
  strong?: boolean;
  tone?: "default" | "success" | "danger";
}) {
  const className =
    tone === "success"
      ? "text-emerald-700"
      : tone === "danger"
        ? "text-rose-700"
        : "text-slate-900";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`${strong ? "font-semibold" : "font-medium"} ${className}`}>
        {unit ? `${value.toLocaleString("es-AR")} ${unit}` : formatCurrency(value)}
      </span>
    </div>
  );
}
