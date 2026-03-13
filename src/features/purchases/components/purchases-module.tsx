"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import {
  ArrowRightLeft,
  FileDown,
  Loader2,
  PackageCheck,
  PackageOpen,
  Plus,
  RefreshCw,
  Save,
  ShoppingCart,
  Trash2,
  Truck,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { buildPurchaseDraft, type PurchaseSourceType } from "@/domain/purchases";
import {
  applyDraftSourceRecordToForm,
  buildPurchaseExportCsv,
  createEmptyPurchaseDraftInput,
  createPurchasesFromDraftRecord,
  getPurchaseDetailRecord,
  getPurchaseSourceLabel,
  listPurchaseRecords,
  listPurchaseSourceOptions,
  listPurchaseSuppliersOptions,
  preparePurchaseDraftFromSource,
  updatePurchaseHeaderRecord,
  updatePurchaseItemReceivedRecord,
} from "@/features/purchases/actions";
import {
  PurchaseDraftFormSchema,
  type PurchaseDraftFormInput,
  type PurchaseDraftItemInput,
  type PurchaseHeaderEditInput,
  type PurchasesQueryInput,
} from "@/features/purchases/schemas";
import type {
  PurchaseDetailRecord,
  PurchaseRecord,
  PurchaseSourceOption,
  PurchaseSupplierOption,
} from "@/features/purchases/types";
import { PURCHASE_STATUS_LABELS } from "@/services/purchases";
import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
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
import { downloadText, formatCurrency, formatDate, formatNumber } from "@/lib/utils";

const INITIAL_FILTERS: PurchasesQueryInput = {
  search: "",
  status: "",
  supplier_id: "",
  source_type: "",
  include_deleted: false,
};
const EMPTY_DRAFT_ITEMS: PurchaseDraftFormInput["items"] = [];

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

function getFactorLabel(sourceType: PurchaseSourceType) {
  return sourceType === "ecommerce_product" ? "Unidades a producir" : "Multiplicador";
}

function getSourceTypeLabel(sourceType: PurchaseSourceType) {
  return getPurchaseSourceLabel(sourceType);
}

function createEmptyDraftItem(): PurchaseDraftFormInput["items"][number] {
  return {
    descripcion_snapshot: "Nuevo item",
    material_id: null,
    supplier_id: null,
    supplier_name: null,
    cantidad: 1,
    unidad_snapshot: "unidad",
    costo_unitario_snapshot: 0,
    source_line_id: null,
    source_line_label: null,
  };
}

function mapDraftItemToDomain(
  item: PurchaseDraftItemInput,
  sourceType: PurchaseSourceType,
  sourceId: string,
) {
  return {
    lineId: item.line_id,
    materialId: item.material_id,
    supplierId: item.supplier_id,
    supplierName: item.supplier_name ?? null,
    description: item.descripcion_snapshot,
    quantity: Number(item.cantidad || 0),
    unit: item.unidad_snapshot,
    unitCost: Number(item.costo_unitario_snapshot || 0),
    sourceType,
    sourceId,
    sourceLineId: item.source_line_id ?? null,
    sourceLineLabel: item.source_line_label ?? null,
  };
}

export function PurchasesModule() {
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [sourceOptions, setSourceOptions] = useState<PurchaseSourceOption[]>([]);
  const [suppliers, setSuppliers] = useState<PurchaseSupplierOption[]>([]);
  const [filters, setFilters] = useState<PurchasesQueryInput>(INITIAL_FILTERS);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<PurchaseDetailRecord | null>(null);
  const [detailHeader, setDetailHeader] = useState<PurchaseHeaderEditInput>({
    fecha_entrega_estimada: "",
    notas: "",
  });
  const [receiptDrafts, setReceiptDrafts] = useState<Record<string, string>>({});
  const [isLoadingReferences, setIsLoadingReferences] = useState(true);
  const [isLoadingPurchases, setIsLoadingPurchases] = useState(true);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [isPreparingDraft, setIsPreparingDraft] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSavingDetail, setIsSavingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const form = useForm<PurchaseDraftFormInput>({
    resolver: zodResolver(PurchaseDraftFormSchema),
    defaultValues: createEmptyPurchaseDraftInput(),
    mode: "onChange",
  });

  const itemsFieldArray = useFieldArray({
    control: form.control,
    name: "items",
    keyName: "fieldKey",
  });

  const debouncedSearch = useDebouncedValue(filters.search || "", 300);
  const effectiveFilters = useMemo(
    () => ({
      ...filters,
      search: debouncedSearch,
    }),
    [debouncedSearch, filters],
  );

  const watchedValues = form.watch();
  const watchedItems = watchedValues.items ?? EMPTY_DRAFT_ITEMS;
  const watchedSourceType = watchedValues.source_type;
  const watchedSourceId = watchedValues.source_id;

  const availableSourceOptions = useMemo(
    () => sourceOptions.filter((option) => option.type === watchedSourceType),
    [sourceOptions, watchedSourceType],
  );

  const sourceOptionMap = useMemo(
    () => new Map(sourceOptions.map((option) => [`${option.type}:${option.id}`, option])),
    [sourceOptions],
  );

  const draftPreview = useMemo(() => {
    if (!watchedSourceId || watchedItems.length === 0) {
      return buildPurchaseDraft([]);
    }

    return buildPurchaseDraft(
      watchedItems.map((item) => mapDraftItemToDomain(item, watchedSourceType, watchedSourceId)),
    );
  }, [watchedItems, watchedSourceId, watchedSourceType]);

  const loadReferences = useCallback(async () => {
    setIsLoadingReferences(true);
    setError(null);

    try {
      const [sourceResult, suppliersResult] = await Promise.all([
        listPurchaseSourceOptions(),
        listPurchaseSuppliersOptions(),
      ]);

      setSourceOptions(sourceResult);
      setSuppliers(suppliersResult);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoadingReferences(false);
    }
  }, []);

  const loadPurchases = useCallback(async () => {
    setIsLoadingPurchases(true);
    setError(null);

    try {
      const records = await listPurchaseRecords(effectiveFilters);
      setPurchases(records);

      if (selectedPurchaseId && !records.some((record) => record.id === selectedPurchaseId)) {
        setSelectedPurchaseId(null);
        setSelectedDetail(null);
      }
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoadingPurchases(false);
    }
  }, [effectiveFilters, selectedPurchaseId]);

  const loadDetail = useCallback(async (purchaseId: string) => {
    setIsLoadingDetail(true);
    setFeedback(null);

    try {
      const detail = await getPurchaseDetailRecord(purchaseId);
      if (!detail) {
        throw new Error("No se encontro la compra.");
      }

      setSelectedPurchaseId(detail.purchase.id);
      setSelectedDetail(detail);
      setDetailHeader({
        fecha_entrega_estimada: detail.purchase.fecha_entrega_estimada
          ? detail.purchase.fecha_entrega_estimada.slice(0, 10)
          : "",
        notas: detail.purchase.notas ?? "",
      });
      setReceiptDrafts(
        Object.fromEntries(
          detail.items.map((item) => [item.id, String(Number(item.cantidad_recibida || 0))]),
        ),
      );
    } catch (detailError) {
      setFeedback({ type: "error", message: getErrorMessage(detailError) });
    } finally {
      setIsLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    void loadReferences();
  }, [loadReferences]);

  useEffect(() => {
    void loadPurchases();
  }, [loadPurchases]);

  useEffect(() => {
    if (availableSourceOptions.length === 0) {
      return;
    }

    const exists = availableSourceOptions.some((option) => option.id === watchedSourceId);
    if (!exists) {
      form.setValue("source_id", availableSourceOptions[0]?.id ?? "", {
        shouldDirty: false,
        shouldValidate: true,
      });
      form.setValue("factor", availableSourceOptions[0]?.default_factor ?? 1, {
        shouldDirty: false,
        shouldValidate: true,
      });
    }
  }, [availableSourceOptions, form, watchedSourceId]);

  const startNewDraft = useCallback(() => {
    setFeedback(null);
    const firstOption = sourceOptions.find((option) => option.type === watchedSourceType);
    form.reset(
      createEmptyPurchaseDraftInput({
        sourceType: watchedSourceType,
        sourceId: firstOption?.id ?? "",
        factor: firstOption?.default_factor ?? 1,
      }),
    );
  }, [form, sourceOptions, watchedSourceType]);

  const addManualItem = useCallback(() => {
    itemsFieldArray.append(createEmptyDraftItem());
  }, [itemsFieldArray]);

  const prepareDraft = useCallback(async () => {
    const isValid = await form.trigger(["source_type", "source_id", "factor"]);
    if (!isValid) {
      return;
    }

    setIsPreparingDraft(true);
    setFeedback(null);

    try {
      const draft = await preparePurchaseDraftFromSource({
        source_type: form.getValues("source_type"),
        source_id: form.getValues("source_id"),
        factor: Number(form.getValues("factor") || 1),
      });

      form.reset(applyDraftSourceRecordToForm(form.getValues(), draft));
      setFeedback({
        type: "success",
        message: `Borrador preparado con ${draft.summary.itemsCount} items consolidados.`,
      });
    } catch (draftError) {
      setFeedback({ type: "error", message: getErrorMessage(draftError) });
    } finally {
      setIsPreparingDraft(false);
    }
  }, [form]);

  const confirmDraft = form.handleSubmit(async (values) => {
    setIsSavingDraft(true);
    setFeedback(null);

    try {
      const createdPurchases = await createPurchasesFromDraftRecord(values);
      setFeedback({
        type: "success",
        message: `Se generaron ${createdPurchases.length} ordenes de compra.`,
      });

      if (createdPurchases[0]) {
        setSelectedPurchaseId(createdPurchases[0].purchase.id);
        setSelectedDetail(createdPurchases[0]);
        setDetailHeader({
          fecha_entrega_estimada: createdPurchases[0].purchase.fecha_entrega_estimada
            ? createdPurchases[0].purchase.fecha_entrega_estimada.slice(0, 10)
            : "",
          notas: createdPurchases[0].purchase.notas ?? "",
        });
        setReceiptDrafts(
          Object.fromEntries(
            createdPurchases[0].items.map((item) => [
              item.id,
              String(Number(item.cantidad_recibida || 0)),
            ]),
          ),
        );
      }

      await loadPurchases();
      startNewDraft();
    } catch (saveError) {
      setFeedback({ type: "error", message: getErrorMessage(saveError) });
    } finally {
      setIsSavingDraft(false);
    }
  });

  const saveDetailHeader = useCallback(async () => {
    if (!selectedPurchaseId) {
      return;
    }

    setIsSavingDetail(true);
    setFeedback(null);

    try {
      const detail = await updatePurchaseHeaderRecord(selectedPurchaseId, detailHeader);
      setSelectedDetail(detail);
      setFeedback({ type: "success", message: "Encabezado de compra actualizado." });
      await loadPurchases();
    } catch (saveError) {
      setFeedback({ type: "error", message: getErrorMessage(saveError) });
    } finally {
      setIsSavingDetail(false);
    }
  }, [detailHeader, loadPurchases, selectedPurchaseId]);

  const updateReceipt = useCallback(
    async (itemId: string, quantity: number) => {
      if (!selectedPurchaseId) {
        return;
      }

      setIsSavingDetail(true);
      setFeedback(null);

      try {
        const detail = await updatePurchaseItemReceivedRecord(selectedPurchaseId, itemId, quantity);
        setSelectedDetail(detail);
        setReceiptDrafts(
          Object.fromEntries(
            detail.items.map((item) => [item.id, String(Number(item.cantidad_recibida || 0))]),
          ),
        );
        setFeedback({ type: "success", message: "Recepcion actualizada." });
        await loadPurchases();
      } catch (updateError) {
        setFeedback({ type: "error", message: getErrorMessage(updateError) });
      } finally {
        setIsSavingDetail(false);
      }
    },
    [loadPurchases, selectedPurchaseId],
  );

  const exportSelectedPurchase = useCallback(() => {
    if (!selectedDetail) {
      return;
    }

    const sourceOption =
      sourceOptionMap.get(
        `${selectedDetail.purchase.source_type as PurchaseSourceType}:${selectedDetail.purchase.source_id}`,
      ) ?? null;
    const sourceId = selectedDetail.purchase.source_id ?? selectedDetail.purchase.id;
    const sourceLabel =
      sourceOption?.label ??
      `${getSourceTypeLabel(selectedDetail.purchase.source_type as PurchaseSourceType)} ${sourceId.slice(0, 8)}`;

    const csv = buildPurchaseExportCsv({
      purchaseId: selectedDetail.purchase.id,
      supplierName: selectedDetail.purchase.supplier?.nombre ?? null,
      sourceLabel,
      status: PURCHASE_STATUS_LABELS[selectedDetail.purchase.status] ?? selectedDetail.purchase.status,
      issueDate: selectedDetail.purchase.fecha_emision,
      expectedDate: selectedDetail.purchase.fecha_entrega_estimada,
      currency: selectedDetail.purchase.moneda,
      notes: selectedDetail.purchase.notas,
      items: selectedDetail.items.map((item) => ({
        description: item.descripcion_snapshot ?? item.material?.nombre ?? "Item",
        quantity: Number(item.cantidad || 0),
        unit: item.unidad_snapshot ?? item.material?.unidad ?? "unidad",
        unitCost: Number(item.costo_unitario_snapshot || 0),
        subtotal: Number(item.subtotal_snapshot || 0),
      })),
    });

    downloadText(`compra-${selectedDetail.purchase.id.slice(0, 8)}.csv`, csv, "text/csv;charset=utf-8");
  }, [selectedDetail, sourceOptionMap]);

  const columns: ColumnDef<PurchaseRecord>[] = [
    {
      accessorKey: "source_type",
      header: "Origen",
      cell: ({ row }) => {
        const record = row.original;
        const sourceOption = sourceOptionMap.get(
          `${record.source_type as PurchaseSourceType}:${record.source_id ?? ""}`,
        );
        return (
          <div>
            <p className="font-medium text-slate-900">
              {sourceOption?.label ??
                `${getSourceTypeLabel(record.source_type as PurchaseSourceType)} ${record.source_id?.slice(0, 8) ?? ""}`}
            </p>
            <p className="text-xs text-slate-500">
              {sourceOption?.description ?? getSourceTypeLabel(record.source_type as PurchaseSourceType)}
            </p>
          </div>
        );
      },
    },
    {
      id: "supplier",
      header: "Proveedor",
      cell: ({ row }) => row.original.supplier?.nombre ?? "Sin proveedor",
    },
    {
      accessorKey: "status",
      header: "Estado",
      cell: ({ row }) => (
        <StatusBadge
          status={row.original.status}
          label={PURCHASE_STATUS_LABELS[row.original.status] ?? row.original.status}
        />
      ),
    },
    {
      id: "totals",
      header: "Items / Total",
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium text-slate-900">{row.original.item_count} items</p>
          <CurrencyCell value={Number(row.original.total_snapshot || 0)} />
        </div>
      ),
    },
    {
      accessorKey: "fecha_emision",
      header: "Fecha",
      cell: ({ row }) => formatDate(row.original.fecha_emision),
    },
    {
      id: "actions",
      header: "Detalle",
      cell: ({ row }) => (
        <Button
          type="button"
          size="sm"
          variant={selectedPurchaseId === row.original.id ? "secondary" : "outline"}
          onClick={() => void loadDetail(row.original.id)}
        >
          Ver
        </Button>
      ),
    },
  ];

  if (isLoadingReferences && sourceOptions.length === 0) {
    return (
      <LoadingState
        title="Cargando compras"
        description="Preparando fuentes automaticas y proveedores..."
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Compras Automaticas"
        description="Genera ordenes desde proyectos, ecommerce y corte con consolidacion por material y agrupacion por proveedor."
        actions={
          <>
            <Button type="button" variant="outline" onClick={startNewDraft}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Resetear borrador
            </Button>
            <Button type="button" variant="outline" onClick={() => void prepareDraft()} disabled={isPreparingDraft}>
              {isPreparingDraft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRightLeft className="mr-2 h-4 w-4" />}
              Preparar
            </Button>
            <Button
              type="button"
              onClick={() => void confirmDraft()}
              disabled={isSavingDraft || watchedItems.length === 0 || !form.formState.isValid}
            >
              {isSavingDraft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-2 h-4 w-4" />}
              Confirmar compras
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
            placeholder="Buscar por proveedor, notas o origen"
          />
        }
        filters={
          <>
            <Select
              value={filters.status || ""}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as PurchasesQueryInput["status"],
                }))
              }
              className="min-w-40"
            >
              <option value="">Todos los estados</option>
              {Object.entries(PURCHASE_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>

            <Select
              value={filters.supplier_id || ""}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  supplier_id: event.target.value,
                }))
              }
              className="min-w-48"
            >
              <option value="">Todos los proveedores</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.nombre}
                </option>
              ))}
            </Select>

            <Select
              value={filters.source_type || ""}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  source_type: event.target.value as PurchasesQueryInput["source_type"],
                }))
              }
              className="min-w-44"
            >
              <option value="">Todas las fuentes</option>
              <option value="custom_project">Proyecto a medida</option>
              <option value="ecommerce_product">Producto ecommerce</option>
              <option value="cut_job">Trabajo de corte</option>
            </Select>
          </>
        }
        actions={
          <Button type="button" variant="outline" onClick={() => setFilters(INITIAL_FILTERS)}>
            Limpiar filtros
          </Button>
        }
      />

      {error && !isLoadingPurchases ? <ErrorState description={error} onRetry={() => void loadPurchases()} /> : null}

      <SectionCard title="Listado de compras" description="Ordenes confirmadas con filtros por proveedor y estado.">
        {isLoadingPurchases ? (
          <LoadingState title="Cargando compras" description="Consultando ordenes existentes..." />
        ) : purchases.length === 0 ? (
          <EmptyState
            title="No hay compras registradas"
            description="Genera la primera orden desde un proyecto, producto o trabajo de corte."
          />
        ) : (
          <DataGrid<PurchaseRecord>
            data={purchases}
            columns={columns}
            hideSearch
            toolbarSlot={<span className="text-xs text-slate-500">{purchases.length} ordenes</span>}
          />
        )}
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.95fr)]">
        <SectionCard
          title="Generador de compras"
          description="Prepara un borrador editable antes de confirmar las ordenes agrupadas por proveedor."
        >
          <form className="space-y-4" onSubmit={confirmDraft}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <FormFieldWrapper label="Fuente" required error={form.formState.errors.source_type?.message}>
                <Select
                  value={watchedValues.source_type}
                  onChange={(event) => {
                    const nextType = event.target.value as PurchaseSourceType;
                    const firstOption = sourceOptions.find((option) => option.type === nextType);
                    form.setValue("source_type", nextType, { shouldDirty: true, shouldValidate: true });
                    form.setValue("source_id", firstOption?.id ?? "", { shouldDirty: true, shouldValidate: true });
                    form.setValue("factor", firstOption?.default_factor ?? 1, { shouldDirty: true, shouldValidate: true });
                  }}
                >
                  <option value="custom_project">Proyecto a medida</option>
                  <option value="ecommerce_product">Producto ecommerce</option>
                  <option value="cut_job">Trabajo de corte</option>
                </Select>
              </FormFieldWrapper>

              <FormFieldWrapper label="Registro" required error={form.formState.errors.source_id?.message}>
                <Select
                  value={watchedValues.source_id}
                  onChange={(event) => {
                    const sourceId = event.target.value;
                    const option = availableSourceOptions.find((item) => item.id === sourceId);
                    form.setValue("source_id", sourceId, { shouldDirty: true, shouldValidate: true });
                    if (option) {
                      form.setValue("factor", option.default_factor, { shouldDirty: true, shouldValidate: true });
                    }
                  }}
                >
                  {availableSourceOptions.length === 0 ? <option value="">Sin opciones disponibles</option> : null}
                  {availableSourceOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </FormFieldWrapper>

              <FormFieldWrapper label={getFactorLabel(watchedSourceType)} error={form.formState.errors.factor?.message}>
                <Input type="number" min={1} step="1" {...form.register("factor", { setValueAs: (value) => Number(value || 1) })} />
              </FormFieldWrapper>

              <FormFieldWrapper label="Fecha emision" required error={form.formState.errors.fecha_emision?.message}>
                <Input type="date" {...form.register("fecha_emision")} />
              </FormFieldWrapper>

              <FormFieldWrapper label="Fecha entrega" error={form.formState.errors.fecha_entrega_estimada?.message}>
                <Input type="date" {...form.register("fecha_entrega_estimada")} />
              </FormFieldWrapper>

              <FormFieldWrapper label="Moneda" error={form.formState.errors.moneda?.message}>
                <Input {...form.register("moneda")} />
              </FormFieldWrapper>

              <FormFieldWrapper label="Notas" error={form.formState.errors.notas?.message} className="md:col-span-2 xl:col-span-2">
                <Textarea rows={2} {...form.register("notas")} />
              </FormFieldWrapper>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <MetricCard label="Proveedores" value={String(draftPreview.summary.suppliersCount)} />
              <MetricCard label="Items consolidados" value={String(draftPreview.summary.itemsCount)} />
              <MetricCard label="Total borrador" value={formatCurrency(draftPreview.summary.subtotal)} />
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <PackageOpen className="h-4 w-4" />
              <span>
                {availableSourceOptions.find((option) => option.id === watchedSourceId)?.description ??
                  "Selecciona una fuente para preparar el borrador."}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => void prepareDraft()} disabled={isPreparingDraft}>
                {isPreparingDraft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRightLeft className="mr-2 h-4 w-4" />}
                Recalcular desde fuente
              </Button>
              <Button type="button" variant="outline" onClick={addManualItem}>
                <Plus className="mr-2 h-4 w-4" />
                Agregar item manual
              </Button>
              <Button type="button" variant="outline" onClick={startNewDraft}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Limpiar
              </Button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-60">Descripcion</TableHead>
                    <TableHead className="min-w-44">Proveedor</TableHead>
                    <TableHead>Cantidad</TableHead>
                    <TableHead>Unidad</TableHead>
                    <TableHead>Costo unit.</TableHead>
                    <TableHead>Subtotal</TableHead>
                    <TableHead className="min-w-48">Referencia</TableHead>
                    <TableHead className="w-14" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemsFieldArray.fields.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="py-6 text-center text-sm text-slate-500">
                        Prepara una fuente o agrega items manuales para empezar.
                      </TableCell>
                    </TableRow>
                  ) : null}

                  {itemsFieldArray.fields.map((field, index) => {
                    const line = watchedItems[index];
                    const subtotal = Number(line?.cantidad || 0) * Number(line?.costo_unitario_snapshot || 0);
                    const lineError = form.formState.errors.items?.[index];

                    return (
                      <TableRow key={field.fieldKey}>
                        <TableCell>
                          <Input {...form.register(`items.${index}.descripcion_snapshot`)} />
                          {lineError?.descripcion_snapshot?.message ? <p className="mt-1 text-xs text-rose-600">{lineError.descripcion_snapshot.message}</p> : null}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={line?.supplier_id ?? ""}
                            onChange={(event) => {
                              const supplierId = event.target.value || null;
                              const supplier = suppliers.find((item) => item.id === supplierId) ?? null;
                              form.setValue(`items.${index}.supplier_id`, supplierId, { shouldDirty: true, shouldValidate: true });
                              form.setValue(`items.${index}.supplier_name`, supplier?.nombre ?? null, { shouldDirty: true });
                            }}
                          >
                            <option value="">Sin proveedor</option>
                            {suppliers.map((supplier) => (
                              <option key={supplier.id} value={supplier.id}>
                                {supplier.nombre}
                              </option>
                            ))}
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input type="number" min={0.0001} step="0.0001" {...form.register(`items.${index}.cantidad`, { setValueAs: (value) => Number(value || 0) })} />
                          {lineError?.cantidad?.message ? <p className="mt-1 text-xs text-rose-600">{lineError.cantidad.message}</p> : null}
                        </TableCell>
                        <TableCell>
                          <Input {...form.register(`items.${index}.unidad_snapshot`)} />
                        </TableCell>
                        <TableCell>
                          <Input type="number" min={0} step="0.01" {...form.register(`items.${index}.costo_unitario_snapshot`, { setValueAs: (value) => Number(value || 0) })} />
                        </TableCell>
                        <TableCell className="text-sm font-medium text-slate-900">{formatCurrency(subtotal)}</TableCell>
                        <TableCell className="text-xs text-slate-500">{line?.source_line_label || "-"}</TableCell>
                        <TableCell>
                          <Button type="button" size="icon" variant="ghost" aria-label="Quitar item" onClick={() => itemsFieldArray.remove(index)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900">Agrupacion por proveedor</h3>
                <Badge variant="secondary">{draftPreview.groups.length} grupos</Badge>
              </div>

              {draftPreview.groups.length === 0 ? (
                <EmptyState title="Sin agrupacion disponible" description="Todavia no hay items suficientes para consolidar compras." icon={Truck} className="p-5" />
              ) : (
                <div className="space-y-3">
                  {draftPreview.groups.map((group) => (
                    <div key={group.supplierId ?? "no-supplier"} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-900">{group.supplierName ?? "Sin proveedor"}</p>
                          <p className="text-xs text-slate-500">{group.items.length} items | {formatNumber(group.totalQuantity, 2)} unidades</p>
                        </div>
                        <Badge variant="secondary">{formatCurrency(group.subtotal)}</Badge>
                      </div>

                      <div className="mt-3 space-y-2">
                        {group.items.map((item) => (
                          <div key={item.lineId} className="flex items-center justify-between gap-3 rounded-lg border border-white bg-white px-3 py-2 text-sm">
                            <div>
                              <p className="font-medium text-slate-900">{item.description}</p>
                              <p className="text-xs text-slate-500">{formatNumber(item.quantity, 4)} {item.unit}</p>
                            </div>
                            <span className="font-medium text-slate-900">{formatCurrency(item.subtotal)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </form>
        </SectionCard>

        <SectionCard
          title="Detalle de compra"
          description="Seguimiento de recepcion, encabezado editable y exportacion."
          actions={
            <Button type="button" variant="outline" disabled={!selectedDetail} onClick={exportSelectedPurchase}>
              <FileDown className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
          }
        >
          {isLoadingDetail ? (
            <LoadingState title="Cargando detalle" description="Recuperando items de la orden..." />
          ) : !selectedDetail ? (
            <EmptyState title="Selecciona una compra" description="Abre una orden desde el listado para ver y actualizar su recepcion." icon={PackageCheck} />
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <MetricCard label="Proveedor" value={selectedDetail.purchase.supplier?.nombre ?? "Sin proveedor"} />
                <MetricCard label="Estado" value={PURCHASE_STATUS_LABELS[selectedDetail.summary.status] ?? selectedDetail.summary.status} />
                <MetricCard label="Total" value={formatCurrency(Number(selectedDetail.purchase.total_snapshot || 0))} />
                <MetricCard label="Recibidos" value={`${selectedDetail.summary.purchased_items_count}/${selectedDetail.summary.item_count}`} />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <FormFieldWrapper label="Fecha entrega">
                  <Input
                    type="date"
                    value={detailHeader.fecha_entrega_estimada ?? ""}
                    onChange={(event) => setDetailHeader((current) => ({ ...current, fecha_entrega_estimada: event.target.value }))}
                  />
                </FormFieldWrapper>
                <FormFieldWrapper label="Estado actual">
                  <div className="flex h-9 items-center">
                    <StatusBadge status={selectedDetail.summary.status} label={PURCHASE_STATUS_LABELS[selectedDetail.summary.status] ?? selectedDetail.summary.status} />
                  </div>
                </FormFieldWrapper>
              </div>

              <FormFieldWrapper label="Notas">
                <Textarea rows={3} value={detailHeader.notas ?? ""} onChange={(event) => setDetailHeader((current) => ({ ...current, notas: event.target.value }))} />
              </FormFieldWrapper>

              <div className="flex items-center justify-end">
                <Button type="button" variant="outline" onClick={() => void saveDetailHeader()} disabled={isSavingDetail}>
                  {isSavingDetail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Guardar encabezado
                </Button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-56">Item</TableHead>
                      <TableHead>Cant.</TableHead>
                      <TableHead>Recibido</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Subtotal</TableHead>
                      <TableHead className="min-w-44">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedDetail.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <p className="font-medium text-slate-900">{item.descripcion_snapshot ?? item.material?.nombre ?? "Item"}</p>
                          <p className="text-xs text-slate-500">{item.material?.codigo ?? item.unidad_snapshot ?? "unidad"}</p>
                        </TableCell>
                        <TableCell>{formatNumber(Number(item.cantidad || 0), 4)} {item.unidad_snapshot ?? "u"}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            max={Number(item.cantidad || 0)}
                            step="0.0001"
                            value={receiptDrafts[item.id] ?? "0"}
                            onChange={(event) => setReceiptDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
                          />
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={item.estado} label={PURCHASE_STATUS_LABELS[item.estado] ?? item.estado} />
                        </TableCell>
                        <TableCell>{formatCurrency(Number(item.subtotal_snapshot || 0))}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => void updateReceipt(item.id, Number(receiptDrafts[item.id] ?? item.cantidad_recibida ?? 0))} disabled={isSavingDetail}>
                              Aplicar
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => void updateReceipt(item.id, 0)} disabled={isSavingDetail}>
                              Pendiente
                            </Button>
                            <Button type="button" size="sm" onClick={() => void updateReceipt(item.id, Number(item.cantidad || 0))} disabled={isSavingDetail}>
                              Completo
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
