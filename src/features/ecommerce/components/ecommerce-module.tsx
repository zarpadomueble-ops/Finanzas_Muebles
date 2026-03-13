"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import { Copy, Pencil, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { calculateEcommerceProductCost, type CostingGlobalSettingsInput } from "@/domain/costing";
import {
  ECOMMERCE_CHANNEL_OPTIONS,
  archiveEcommerceRecord,
  buildDefaultChannelSimulator,
  buildDefaultEcommerceProcessLines,
  createEcommerceBundleRecord,
  createEmptyEcommerceFormInput,
  duplicateEcommerceRecord,
  getChannelLabel,
  getEcommerceCostingSettingsInput,
  getEcommerceDetailRecord,
  listEcommerceMaterialOptions,
  listEcommerceRecords,
  mapEcommerceDetailToFormInput,
  restoreEcommerceRecord,
  updateEcommerceBundleRecord,
} from "@/features/ecommerce/actions";
import {
  EcommerceChannelSimulationSchema,
  EcommerceProductBundleFormSchema,
  type EcommerceChannelSimulationInput,
  type EcommerceProductBundleFormInput,
  type EcommerceQueryInput,
} from "@/features/ecommerce/schemas";
import type { EcommerceMaterialOption, EcommerceProductRecord } from "@/features/ecommerce/types";
import {
  ECOMMERCE_PROCESS_LABELS,
  ECOMMERCE_PROCESS_OPTIONS,
  ECOMMERCE_STATUS_LABELS,
  ECOMMERCE_STATUS_OPTIONS,
} from "@/services/ecommerce";
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatCurrency, formatDate, formatMeasure, formatPercent } from "@/lib/utils";

const INITIAL_FILTERS: EcommerceQueryInput = {
  search: "",
  status: "",
  include_deleted: false,
};
const EMPTY_MATERIAL_LINES: EcommerceProductBundleFormInput["materials"] = [];
const EMPTY_PROCESS_LINES: EcommerceProductBundleFormInput["processes"] = [];
const EMPTY_CHANNEL_SIMULATION: EcommerceChannelSimulationInput[] = [];

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return "Ocurrio un error inesperado.";
}

function getMarginTone(realMarginPct: number, targetMarginPct: number) {
  if (realMarginPct >= targetMarginPct) return "success" as const;
  if (realMarginPct > 0) return "warning" as const;
  return "danger" as const;
}

function getStatusLabel(status: string) {
  const normalized = status.trim().toLowerCase();
  if (ECOMMERCE_STATUS_OPTIONS.includes(normalized as EcommerceProductBundleFormInput["estado"])) {
    return ECOMMERCE_STATUS_LABELS[normalized as EcommerceProductBundleFormInput["estado"]];
  }
  return status;
}

function formatDimensionSummary(
  anchoMm: number | null | undefined,
  altoMm: number | null | undefined,
  profundidadMm: number | null | undefined,
) {
  const values = [anchoMm, altoMm, profundidadMm];
  if (values.every((value) => !value || value <= 0)) return "-";
  const width = anchoMm && anchoMm > 0 ? formatMeasure(anchoMm, 0) : "-";
  const height = altoMm && altoMm > 0 ? formatMeasure(altoMm, 0) : "-";
  const depth = profundidadMm && profundidadMm > 0 ? formatMeasure(profundidadMm, 0) : "-";
  return `${width} x ${height} x ${depth}`;
}

export function EcommerceProductsModule() {
  const [products, setProducts] = useState<EcommerceProductRecord[]>([]);
  const [materialsCatalog, setMaterialsCatalog] = useState<EcommerceMaterialOption[]>([]);
  const [costingSettings, setCostingSettings] = useState<CostingGlobalSettingsInput | null>(null);
  const [defaultCostHour, setDefaultCostHour] = useState<number | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [filters, setFilters] = useState<EcommerceQueryInput>(INITIAL_FILTERS);
  const [channelSimulator, setChannelSimulator] = useState<EcommerceChannelSimulationInput[]>(EMPTY_CHANNEL_SIMULATION);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [isLoadingReferences, setIsLoadingReferences] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [archiveTarget, setArchiveTarget] = useState<EcommerceProductRecord | null>(null);
  const [hasInitializedForm, setHasInitializedForm] = useState(false);

  const form = useForm<EcommerceProductBundleFormInput>({
    resolver: zodResolver(EcommerceProductBundleFormSchema),
    defaultValues: createEmptyEcommerceFormInput(),
    mode: "onChange",
  });

  const materialsFieldArray = useFieldArray({ control: form.control, name: "materials" });
  const processesFieldArray = useFieldArray({ control: form.control, name: "processes" });

  const debouncedSearch = useDebouncedValue(filters.search || "", 300);
  const effectiveFilters = useMemo<EcommerceQueryInput>(() => ({ ...filters, search: debouncedSearch }), [debouncedSearch, filters]);

  const materialsMap = useMemo(() => new Map(materialsCatalog.map((material) => [material.id, material])), [materialsCatalog]);
  const selectedProduct = useMemo(() => products.find((product) => product.id === selectedProductId) ?? null, [products, selectedProductId]);

  const watchedValues = form.watch();
  const watchedMaterials = watchedValues.materials ?? EMPTY_MATERIAL_LINES;
  const watchedProcesses = watchedValues.processes ?? EMPTY_PROCESS_LINES;
  const watchedMarketPrice = watchedValues.precio_mercado ?? null;

  const loadReferences = useCallback(async () => {
    setIsLoadingReferences(true);
    setError(null);

    try {
      const [materialsResult, settingsResult] = await Promise.all([
        listEcommerceMaterialOptions(),
        getEcommerceCostingSettingsInput(),
      ]);

      setMaterialsCatalog(materialsResult);
      setCostingSettings(settingsResult.costing);
      setDefaultCostHour(settingsResult.costing.costoHoraTaller);

      if (!hasInitializedForm) {
        const empty = createEmptyEcommerceFormInput({ defaultCostHour: settingsResult.costing.costoHoraTaller });
        form.reset(empty);
        setChannelSimulator(buildDefaultChannelSimulator(settingsResult.costing, empty.precio_mercado));
        setHasInitializedForm(true);
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoadingReferences(false);
    }
  }, [form, hasInitializedForm]);

  const loadProducts = useCallback(async () => {
    setIsLoadingProducts(true);
    setError(null);

    try {
      const records = await listEcommerceRecords(effectiveFilters);
      setProducts(records);

      if (selectedProductId && !records.some((product) => product.id === selectedProductId)) {
        setSelectedProductId(null);
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoadingProducts(false);
    }
  }, [effectiveFilters, selectedProductId]);

  useEffect(() => {
    void loadReferences();
  }, [loadReferences]);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    if (form.formState.isDirty && saveState === "saved") {
      setSaveState("idle");
    }
  }, [form.formState.isDirty, saveState]);

  const costPreview = useMemo(() => {
    if (!costingSettings) {
      return null;
    }

    return calculateEcommerceProductCost({
      settings: costingSettings,
      materials: watchedMaterials.map((line) => {
        const material = materialsMap.get(line.material_id);
        return {
          materialId: line.material_id || undefined,
          descripcion: material?.nombre || "Material",
          quantity: Number(line.consumo_unit || 0),
          unitCost: Number(line.costo_unitario || 0),
        };
      }),
      labor: watchedProcesses.map((line) => ({
        processKey: line.proceso_key,
        processName: line.proceso_nombre || ECOMMERCE_PROCESS_LABELS[line.proceso_key],
        hours: Number(line.horas_unit || 0),
        hourlyCost: line.costo_hora ?? defaultCostHour ?? costingSettings.costoHoraTaller,
      })),
      packagingUnitCost: Number(watchedValues.embalaje_unitario || 0),
      shippingUnitCost: Number(watchedValues.envio_unitario || 0),
      marketPrice: watchedMarketPrice,
      marginPct: costingSettings.margenEcommercePct,
      applyGlobalMaterialWaste: true,
      includeCommercialCharges: true,
    });
  }, [
    costingSettings,
    defaultCostHour,
    materialsMap,
    watchedMaterials,
    watchedProcesses,
    watchedValues.embalaje_unitario,
    watchedValues.envio_unitario,
    watchedMarketPrice,
  ]);

  const channelResults = useMemo(() => {
    if (!costingSettings) {
      return [];
    }

    return channelSimulator.map((config) => {
      const parsed = EcommerceChannelSimulationSchema.parse(config);
      const settingsByChannel: CostingGlobalSettingsInput = {
        ...costingSettings,
        comisionCobroPct: parsed.comision_pct,
        publicidadPct: parsed.publicidad_pct,
        impuestosPct: parsed.impuestos_pct,
      };

      return {
        ...parsed,
        result: calculateEcommerceProductCost({
          settings: settingsByChannel,
          materials: watchedMaterials.map((line) => {
            const material = materialsMap.get(line.material_id);
            return {
              materialId: line.material_id || undefined,
              descripcion: material?.nombre || "Material",
              quantity: Number(line.consumo_unit || 0),
              unitCost: Number(line.costo_unitario || 0),
            };
          }),
          labor: watchedProcesses.map((line) => ({
            processKey: line.proceso_key,
            processName: line.proceso_nombre || ECOMMERCE_PROCESS_LABELS[line.proceso_key],
            hours: Number(line.horas_unit || 0),
            hourlyCost: line.costo_hora ?? defaultCostHour ?? settingsByChannel.costoHoraTaller,
          })),
          packagingUnitCost: Number(watchedValues.embalaje_unitario || 0),
          shippingUnitCost: Number(watchedValues.envio_unitario || 0),
          marketPrice: parsed.precio_venta ?? null,
          marginPct: settingsByChannel.margenEcommercePct,
          applyGlobalMaterialWaste: true,
          includeCommercialCharges: true,
        }),
      };
    });
  }, [
    channelSimulator,
    costingSettings,
    defaultCostHour,
    materialsMap,
    watchedMaterials,
    watchedProcesses,
    watchedValues.embalaje_unitario,
    watchedValues.envio_unitario,
  ]);

  const startCreate = useCallback(() => {
    setSelectedProductId(null);
    setFeedback(null);
    setSaveState("idle");
    const empty = createEmptyEcommerceFormInput({ defaultCostHour: defaultCostHour ?? null });
    form.reset(empty);
    if (costingSettings) {
      setChannelSimulator(buildDefaultChannelSimulator(costingSettings, empty.precio_mercado));
    } else {
      setChannelSimulator(EMPTY_CHANNEL_SIMULATION);
    }
  }, [costingSettings, defaultCostHour, form]);

  const startEdit = useCallback(async (productId: string) => {
    setIsLoadingDetail(true);
    setFeedback(null);
    setSaveState("idle");

    try {
      const detail = await getEcommerceDetailRecord(productId);
      if (!detail) {
        throw new Error("No se encontro el producto.");
      }

      const nextValues = mapEcommerceDetailToFormInput(detail, defaultCostHour);
      setSelectedProductId(detail.product.id);
      form.reset(nextValues);

      if (costingSettings) {
        setChannelSimulator(buildDefaultChannelSimulator(costingSettings, nextValues.precio_mercado));
      }
    } catch (detailError) {
      setFeedback({ type: "error", message: getErrorMessage(detailError) });
    } finally {
      setIsLoadingDetail(false);
    }
  }, [costingSettings, defaultCostHour, form]);

  const addMaterialLine = () => {
    const firstMaterial = materialsCatalog[0];
    materialsFieldArray.append({
      material_id: firstMaterial?.id ?? "",
      consumo_unit: 1,
      costo_unitario: Number(firstMaterial?.costo_unitario || 0),
    });
    setSaveState("idle");
  };

  const addProcessLine = () => {
    processesFieldArray.append({
      proceso_key: "armado",
      proceso_nombre: ECOMMERCE_PROCESS_LABELS.armado,
      horas_unit: 0,
      costo_hora: defaultCostHour ?? 0,
    });
    setSaveState("idle");
  };

  const resetBaseProcesses = () => {
    processesFieldArray.replace(buildDefaultEcommerceProcessLines(defaultCostHour ?? null));
    setSaveState("idle");
  };

  const updateChannelField = (
    index: number,
    field: keyof Omit<EcommerceChannelSimulationInput, "channel">,
    value: number | null,
  ) => {
    setChannelSimulator((current) =>
      current.map((item, currentIndex) =>
        currentIndex === index
          ? {
              ...item,
              [field]: value,
            }
          : item,
      ),
    );
  };

  const handleDuplicate = async (productId: string) => {
    setIsSaving(true);
    setFeedback(null);
    setSaveState("saving");

    try {
      const duplicated = await duplicateEcommerceRecord(productId);
      const nextValues = mapEcommerceDetailToFormInput(duplicated, defaultCostHour);
      setSelectedProductId(duplicated.product.id);
      form.reset(nextValues);
      if (costingSettings) {
        setChannelSimulator(buildDefaultChannelSimulator(costingSettings, nextValues.precio_mercado));
      }
      setSaveState("saved");
      setFeedback({ type: "success", message: "Producto duplicado correctamente." });
      await loadProducts();
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
      await archiveEcommerceRecord(archiveTarget.id);
      setArchiveTarget(null);
      setFeedback({ type: "success", message: "Producto archivado correctamente." });
      if (selectedProductId === archiveTarget.id) {
        startCreate();
      }
      await loadProducts();
    } catch (archiveError) {
      setFeedback({ type: "error", message: getErrorMessage(archiveError) });
    } finally {
      setIsSaving(false);
    }
  };

  const restoreProduct = async (productId: string) => {
    setIsSaving(true);
    setFeedback(null);

    try {
      await restoreEcommerceRecord(productId);
      setFeedback({ type: "success", message: "Producto restaurado correctamente." });
      await loadProducts();
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
      const saved = selectedProductId
        ? await updateEcommerceBundleRecord(selectedProductId, values)
        : await createEcommerceBundleRecord(values);

      const nextValues = mapEcommerceDetailToFormInput(saved, defaultCostHour);
      setSelectedProductId(saved.product.id);
      form.reset(nextValues);
      if (costingSettings) {
        setChannelSimulator(buildDefaultChannelSimulator(costingSettings, nextValues.precio_mercado));
      }

      setSaveState("saved");
      setFeedback({
        type: "success",
        message: selectedProductId ? "Producto actualizado correctamente." : "Producto creado correctamente.",
      });
      await loadProducts();
    } catch (submitError) {
      setSaveState("error");
      setFeedback({ type: "error", message: getErrorMessage(submitError) });
    } finally {
      setIsSaving(false);
    }
  });

  const columns: ColumnDef<EcommerceProductRecord>[] = [
    {
      accessorKey: "sku",
      header: "SKU / Producto",
      cell: ({ row }) => {
        const product = row.original;
        return (
          <div>
            <p className="font-medium text-slate-900">{product.sku}</p>
            <p className="text-xs text-slate-500">{product.nombre}</p>
          </div>
        );
      },
    },
    {
      accessorKey: "categoria",
      header: "Categoria",
      cell: ({ row }) => row.original.categoria || "-",
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => <StatusBadge status={row.original.status} label={getStatusLabel(row.original.status)} />,
    },
    {
      id: "costs",
      header: "Costo / Precio",
      cell: ({ row }) => {
        const product = row.original;
        return (
          <div>
            <CurrencyCell value={Number(product.costo_total_canal || 0)} />
            <p className="text-xs text-slate-500">
              Precio: {formatCurrency(Number(product.precio_evaluado || product.precio_sugerido || 0))}
            </p>
          </div>
        );
      },
    },
    {
      id: "margin",
      header: "Margen",
      cell: ({ row }) => (
        <Badge variant={getMarginTone(row.original.margen_real_pct, costingSettings?.margenEcommercePct ?? 0)}>
          {formatPercent(row.original.margen_real_pct, 2)}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => {
        const product = row.original;
        const isArchived = Boolean(product.deleted_at);

        return (
          <div className="flex items-center gap-1">
            <Button type="button" size="icon" variant="ghost" aria-label="Editar producto" disabled={isSaving} onClick={() => void startEdit(product.id)}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button type="button" size="icon" variant="ghost" aria-label="Duplicar producto" disabled={isSaving} onClick={() => void handleDuplicate(product.id)}>
              <Copy className="h-4 w-4" />
            </Button>
            {isArchived ? (
              <Button type="button" size="icon" variant="ghost" aria-label="Restaurar producto" disabled={isSaving} onClick={() => void restoreProduct(product.id)}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" size="icon" variant="ghost" aria-label="Archivar producto" disabled={isSaving} onClick={() => setArchiveTarget(product)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  if (isLoadingReferences && !costingSettings) {
    return <LoadingState title="Cargando ecommerce" description="Preparando materiales y parametros..." />;
  }

  const marketComparisonValue = watchedMarketPrice && costPreview ? watchedMarketPrice - costPreview.precioSugerido : null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Productos Ecommerce"
        description="Costeo unitario, simulador por canal y comparador con mercado."
        actions={
          <>
            <SaveIndicator state={saveState} />
            <Button type="button" variant="outline" onClick={startCreate} disabled={isSaving}><Plus className="mr-2 h-4 w-4" />Nuevo</Button>
            <Button type="button" variant="outline" disabled={!selectedProductId || isSaving} onClick={() => selectedProductId && void handleDuplicate(selectedProductId)}><Copy className="mr-2 h-4 w-4" />Duplicar</Button>
            <Button type="button" onClick={() => void onSubmit()} disabled={isSaving || !form.formState.isValid || isLoadingDetail}><Save className="mr-2 h-4 w-4" />{isSaving ? "Guardando..." : "Guardar"}</Button>
          </>
        }
      />

      {feedback ? (
        <div className={`rounded-lg border px-3 py-2 text-sm ${feedback.type === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"}`}>{feedback.message}</div>
      ) : null}

      <FilterBar
        search={<SearchInput className="w-full" value={filters.search || ""} onChange={(value) => setFilters((current) => ({ ...current, search: value }))} placeholder="Buscar por SKU, nombre o categoria" />}
        filters={
          <>
            <Select value={filters.status || ""} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value as EcommerceQueryInput["status"] }))} className="min-w-44">
              <option value="">Todos los estados</option>
              {ECOMMERCE_STATUS_OPTIONS.map((status) => (<option key={status} value={status}>{ECOMMERCE_STATUS_LABELS[status]}</option>))}
            </Select>
            <div className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5">
              <Switch checked={Boolean(filters.include_deleted)} onChange={(event) => setFilters((current) => ({ ...current, include_deleted: event.currentTarget.checked }))} />
              <span className="text-xs text-slate-600">Ver archivados</span>
            </div>
          </>
        }
        actions={<Button type="button" variant="outline" onClick={() => setFilters(INITIAL_FILTERS)}>Limpiar filtros</Button>}
      />

      {error && !isLoadingProducts ? <ErrorState description={error} onRetry={() => void loadProducts()} /> : null}

      <SectionCard title="Listado de productos" description="Catalogo ecommerce de la cuenta actual.">
        {isLoadingProducts ? <LoadingState title="Cargando productos" description="Consultando base de datos..." /> : (
          <DataGrid<EcommerceProductRecord> data={products} columns={columns} hideSearch toolbarSlot={<span className="text-xs text-slate-500">{products.filter((product) => !product.deleted_at).length} activos</span>} />
        )}
      </SectionCard>

      {isLoadingDetail ? <LoadingState title="Cargando detalle" description="Recuperando materiales y procesos..." /> : null}

      <SectionCard title={selectedProduct ? `Editar: ${selectedProduct.nombre}` : "Nuevo producto"} description="Formulario principal, materiales y procesos.">
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <FormFieldWrapper label="SKU" required error={form.formState.errors.sku?.message}><Input {...form.register("sku")} /></FormFieldWrapper>
                <FormFieldWrapper label="Nombre" required error={form.formState.errors.nombre?.message} className="md:col-span-2"><Input {...form.register("nombre")} /></FormFieldWrapper>
                <FormFieldWrapper label="Categoria" error={form.formState.errors.categoria?.message}><Input {...form.register("categoria")} /></FormFieldWrapper>
                <FormFieldWrapper label="Precio mercado" error={form.formState.errors.precio_mercado?.message}><Input type="number" min={0} step="0.01" {...form.register("precio_mercado", { setValueAs: (value) => (value === "" ? null : Number(value)) })} /></FormFieldWrapper>
                <FormFieldWrapper label="Ancho (mm)" error={form.formState.errors.ancho_mm?.message}><Input type="number" min={0} step="1" {...form.register("ancho_mm", { setValueAs: (value) => (value === "" ? null : Number(value)) })} /></FormFieldWrapper>
                <FormFieldWrapper label="Alto (mm)" error={form.formState.errors.alto_mm?.message}><Input type="number" min={0} step="1" {...form.register("alto_mm", { setValueAs: (value) => (value === "" ? null : Number(value)) })} /></FormFieldWrapper>
                <FormFieldWrapper label="Profundidad (mm)" error={form.formState.errors.profundidad_mm?.message}><Input type="number" min={0} step="1" {...form.register("profundidad_mm", { setValueAs: (value) => (value === "" ? null : Number(value)) })} /></FormFieldWrapper>
                <FormFieldWrapper label="Unidades por lote" required error={form.formState.errors.unidades_lote?.message}><Input type="number" min={1} step="1" {...form.register("unidades_lote", { setValueAs: (value) => (value === "" ? 1 : Number(value)) })} /></FormFieldWrapper>
                <FormFieldWrapper label="Estado" required error={form.formState.errors.estado?.message}>
                  <Select {...form.register("estado")}>{ECOMMERCE_STATUS_OPTIONS.map((status) => (<option key={status} value={status}>{ECOMMERCE_STATUS_LABELS[status]}</option>))}</Select>
                </FormFieldWrapper>
                <FormFieldWrapper label="Embalaje unitario" error={form.formState.errors.embalaje_unitario?.message}><Input type="number" min={0} step="0.01" {...form.register("embalaje_unitario", { setValueAs: (value) => (value === "" ? 0 : Number(value)) })} /></FormFieldWrapper>
                <FormFieldWrapper label="Envio unitario" error={form.formState.errors.envio_unitario?.message}><Input type="number" min={0} step="0.01" {...form.register("envio_unitario", { setValueAs: (value) => (value === "" ? 0 : Number(value)) })} /></FormFieldWrapper>
              </div>

              <SectionCard title="Materiales por unidad" description="Consumo unitario y costo snapshot." actions={<Button type="button" size="sm" variant="secondary" onClick={addMaterialLine}><Plus className="mr-2 h-4 w-4" />Agregar material</Button>}>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead className="min-w-56">Material</TableHead><TableHead>Consumo unit.</TableHead><TableHead>Costo unit.</TableHead><TableHead>Subtotal</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
                    <TableBody>
                      {materialsFieldArray.fields.length === 0 ? <TableRow><TableCell colSpan={5} className="py-4 text-sm text-slate-500">No hay materiales cargados.</TableCell></TableRow> : null}
                      {materialsFieldArray.fields.map((field, index) => {
                        const materialLine = watchedMaterials[index];
                        const selectedMaterial = materialLine ? materialsMap.get(materialLine.material_id) : null;
                        const previewLine = costPreview?.materials.lines[index];
                        const lineError = form.formState.errors.materials?.[index];
                        return (
                          <TableRow key={field.id}>
                            <TableCell>
                              <Select value={materialLine?.material_id || ""} onChange={(event) => {
                                const materialId = event.target.value;
                                form.setValue(`materials.${index}.material_id`, materialId, { shouldDirty: true, shouldValidate: true });
                                const material = materialsMap.get(materialId);
                                if (material) {
                                  form.setValue(`materials.${index}.costo_unitario`, Number(material.costo_unitario || 0), { shouldDirty: true, shouldValidate: true });
                                }
                              }}>
                                <option value="">Seleccionar material</option>
                                {materialsCatalog.map((material) => (<option key={material.id} value={material.id}>{material.codigo} - {material.nombre}</option>))}
                              </Select>
                              {selectedMaterial ? <p className="mt-1 text-xs text-slate-500">{selectedMaterial.unidad}{selectedMaterial.espesor_mm ? ` | ${formatMeasure(selectedMaterial.espesor_mm, 1)}` : ""}</p> : null}
                              {lineError?.material_id?.message ? <p className="mt-1 text-xs text-rose-600">{lineError.material_id.message}</p> : null}
                            </TableCell>
                            <TableCell><Input type="number" min={0} step="0.0001" {...form.register(`materials.${index}.consumo_unit`, { setValueAs: (value) => (value === "" ? 0 : Number(value)) })} />{lineError?.consumo_unit?.message ? <p className="mt-1 text-xs text-rose-600">{lineError.consumo_unit.message}</p> : null}</TableCell>
                            <TableCell><Input type="number" min={0} step="0.01" {...form.register(`materials.${index}.costo_unitario`, { setValueAs: (value) => (value === "" ? 0 : Number(value)) })} />{lineError?.costo_unitario?.message ? <p className="mt-1 text-xs text-rose-600">{lineError.costo_unitario.message}</p> : null}</TableCell>
                            <TableCell className="text-sm font-medium text-slate-900">{formatCurrency(Number(previewLine?.totalSubtotal || 0))}</TableCell>
                            <TableCell><Button type="button" size="icon" variant="ghost" aria-label="Eliminar material" onClick={() => materialsFieldArray.remove(index)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </SectionCard>

              <SectionCard title="Procesos por unidad" description="Horas por proceso con costo/hora editable." actions={<div className="flex items-center gap-2"><Button type="button" size="sm" variant="outline" onClick={resetBaseProcesses}>Procesos base</Button><Button type="button" size="sm" variant="secondary" onClick={addProcessLine}><Plus className="mr-2 h-4 w-4" />Agregar proceso</Button></div>}>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead className="min-w-44">Proceso</TableHead><TableHead>Nombre visible</TableHead><TableHead>Horas unit.</TableHead><TableHead>Costo/hora</TableHead><TableHead>Subtotal</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
                    <TableBody>
                      {processesFieldArray.fields.map((field, index) => {
                        const processLine = watchedProcesses[index];
                        const previewLine = costPreview?.labor.lines[index];
                        const lineError = form.formState.errors.processes?.[index];
                        return (
                          <TableRow key={field.id}>
                            <TableCell>
                              <Select value={processLine?.proceso_key || "armado"} onChange={(event) => {
                                const processKey = event.target.value as (typeof ECOMMERCE_PROCESS_OPTIONS)[number];
                                form.setValue(`processes.${index}.proceso_key`, processKey, { shouldDirty: true, shouldValidate: true });
                                form.setValue(`processes.${index}.proceso_nombre`, ECOMMERCE_PROCESS_LABELS[processKey], { shouldDirty: true, shouldValidate: true });
                              }}>
                                {ECOMMERCE_PROCESS_OPTIONS.map((processKey) => (<option key={processKey} value={processKey}>{ECOMMERCE_PROCESS_LABELS[processKey]}</option>))}
                              </Select>
                              {lineError?.proceso_key?.message ? <p className="mt-1 text-xs text-rose-600">{lineError.proceso_key.message}</p> : null}
                            </TableCell>
                            <TableCell><Input placeholder="Nombre en ficha" {...form.register(`processes.${index}.proceso_nombre`)} />{lineError?.proceso_nombre?.message ? <p className="mt-1 text-xs text-rose-600">{lineError.proceso_nombre.message}</p> : null}</TableCell>
                            <TableCell><Input type="number" min={0} step="0.01" {...form.register(`processes.${index}.horas_unit`, { setValueAs: (value) => (value === "" ? 0 : Number(value)) })} />{lineError?.horas_unit?.message ? <p className="mt-1 text-xs text-rose-600">{lineError.horas_unit.message}</p> : null}</TableCell>
                            <TableCell><Input type="number" min={0} step="0.01" {...form.register(`processes.${index}.costo_hora`, { setValueAs: (value) => (value === "" ? defaultCostHour ?? 0 : Number(value)) })} />{lineError?.costo_hora?.message ? <p className="mt-1 text-xs text-rose-600">{lineError.costo_hora.message}</p> : null}</TableCell>
                            <TableCell className="text-sm font-medium text-slate-900">{formatCurrency(Number(previewLine?.subtotal || 0))}</TableCell>
                            <TableCell><Button type="button" size="icon" variant="ghost" aria-label="Eliminar proceso" onClick={() => processesFieldArray.remove(index)} disabled={processesFieldArray.fields.length <= 1}><Trash2 className="h-4 w-4" /></Button></TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </SectionCard>
            </div>
            <div className="space-y-4">
              <SectionCard title="Resumen de costos" description="Costeo base usando parametros globales." actions={costPreview ? <Badge variant={getMarginTone(costPreview.margenRealPct, costPreview.margenObjetivoPct)}>Margen real {formatPercent(costPreview.margenRealPct, 2)}</Badge> : null}>
                <div className="space-y-2 text-sm">
                  <SummaryRow label="Costo materiales unit" value={costPreview?.costoMaterialesUnit || 0} />
                  <SummaryRow label="Costo mano de obra unit" value={costPreview?.costoManoObraUnit || 0} />
                  <SummaryRow label="Costo base unit" value={costPreview?.costoDirectoUnit || 0} />
                  <SummaryRow label="Costo con embalaje" value={(costPreview?.costoDirectoUnit || 0) + Number(watchedValues.embalaje_unitario || 0) + Number(costingSettings?.embalajePromedio || 0)} />
                  <SummaryRow label="Costo total canal" value={costPreview?.costoTotalUnit || 0} strong />
                  <SummaryRow label="Precio sugerido" value={costPreview?.precioSugerido || 0} strong />
                  <SummaryRow label="Ganancia unit" value={costPreview?.utilidadUnit || 0} />
                </div>
              </SectionCard>

              <SectionCard title="Comparador mercado" description="Precio objetivo vs mercado.">
                <div className="space-y-2 text-sm">
                  <SummaryRow label="Precio mercado" value={watchedMarketPrice || 0} />
                  <SummaryRow label="Precio sugerido" value={costPreview?.precioSugerido || 0} />
                  <SummaryRow label="Diferencia" value={marketComparisonValue || 0} tone={(marketComparisonValue || 0) >= 0 ? "success" : "danger"} />
                </div>
              </SectionCard>

              <SectionCard title="Resumen tecnico" description="Medidas y empaque del producto.">
                <div className="space-y-2 text-sm text-slate-700">
                  <p><span className="text-slate-500">Dimensiones:</span> {formatDimensionSummary(watchedValues.ancho_mm, watchedValues.alto_mm, watchedValues.profundidad_mm)}</p>
                  <p><span className="text-slate-500">Unidades por lote:</span> {watchedValues.unidades_lote || 1}</p>
                  <p><span className="text-slate-500">Materiales:</span> {watchedMaterials.length}</p>
                  <p><span className="text-slate-500">Procesos:</span> {watchedProcesses.length}</p>
                  <p><span className="text-slate-500">Ultima actualizacion:</span> {selectedProduct ? formatDate(selectedProduct.updated_at) : "-"}</p>
                </div>
              </SectionCard>
            </div>
          </div>

          <SectionCard title="Costos por canal" description="Simulador de comisiones/publicidad por canal.">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Canal</TableHead>
                    <TableHead>Comision %</TableHead>
                    <TableHead>Publicidad %</TableHead>
                    <TableHead>Impuestos %</TableHead>
                    <TableHead>Precio venta</TableHead>
                    <TableHead>Costo total</TableHead>
                    <TableHead>Precio sugerido</TableHead>
                    <TableHead>Margen real</TableHead>
                    <TableHead>Ganancia unit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ECOMMERCE_CHANNEL_OPTIONS.map((channel, index) => {
                    const config = channelSimulator[index];
                    const result = channelResults[index]?.result;
                    return (
                      <TableRow key={channel}>
                        <TableCell className="font-medium text-slate-900">{getChannelLabel(channel)}</TableCell>
                        <TableCell><Input type="number" min={0} max={100} step="0.01" value={config?.comision_pct ?? 0} onChange={(event) => updateChannelField(index, "comision_pct", Number(event.target.value))} /></TableCell>
                        <TableCell><Input type="number" min={0} max={100} step="0.01" value={config?.publicidad_pct ?? 0} onChange={(event) => updateChannelField(index, "publicidad_pct", Number(event.target.value))} /></TableCell>
                        <TableCell><Input type="number" min={0} max={100} step="0.01" value={config?.impuestos_pct ?? 0} onChange={(event) => updateChannelField(index, "impuestos_pct", Number(event.target.value))} /></TableCell>
                        <TableCell><Input type="number" min={0} step="0.01" value={config?.precio_venta ?? ""} onChange={(event) => updateChannelField(index, "precio_venta", event.target.value === "" ? null : Number(event.target.value))} /></TableCell>
                        <TableCell>{formatCurrency(Number(result?.costoTotalUnit || 0))}</TableCell>
                        <TableCell>{formatCurrency(Number(result?.precioSugerido || 0))}</TableCell>
                        <TableCell><Badge variant={getMarginTone(Number(result?.margenRealPct || 0), Number(result?.margenObjetivoPct || 0))}>{formatPercent(Number(result?.margenRealPct || 0), 2)}</Badge></TableCell>
                        <TableCell>{formatCurrency(Number(result?.utilidadUnit || 0))}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </SectionCard>
        </form>
      </SectionCard>

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archivar producto"
        description={archiveTarget ? `El producto ${archiveTarget.nombre} dejara de aparecer en el listado activo.` : undefined}
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
  strong = false,
  tone = "default",
}: {
  label: string;
  value: number;
  strong?: boolean;
  tone?: "default" | "success" | "danger";
}) {
  const className = tone === "success" ? "text-emerald-700" : tone === "danger" ? "text-rose-700" : "text-slate-900";

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className={`${strong ? "font-semibold" : "font-medium"} ${className}`}>{formatCurrency(value)}</span>
    </div>
  );
}
