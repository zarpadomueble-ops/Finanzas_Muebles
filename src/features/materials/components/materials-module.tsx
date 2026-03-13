"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import Papa from "papaparse";
import {
  ExternalLink,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import {
  archiveMaterialRecord,
  createMaterialRecord,
  importMaterialsCsvRecords,
  listMaterialsRecords,
  listMaterialSuppliers,
  restoreMaterialRecord,
  toggleMaterialActiveRecord,
  updateMaterialRecord,
} from "@/features/materials/actions";
import {
  MaterialFormSchema,
  type MaterialFormInput,
  type MaterialsQueryInput,
} from "@/features/materials/schemas";
import type { MaterialRecord } from "@/features/materials/types";
import {
  MATERIAL_CATEGORY_OPTIONS,
  MATERIAL_UNIT_OPTIONS,
  calculateMaterialAreaM2,
} from "@/domain/costing/materials";
import {
  ConfirmDialog,
  ErrorState,
  LoadingState,
  SaveIndicator,
} from "@/components/feedback";
import { FilterBar, FormFieldWrapper, SearchInput } from "@/components/forms";
import { PageHeader, SectionCard, StatusBadge } from "@/components/shared";
import { CurrencyCell, DataGrid } from "@/components/tables";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatArea, formatMeasure } from "@/lib/utils";

const DEFAULT_FORM_VALUES: MaterialFormInput = {
  codigo: "",
  nombre: "",
  categoria: "placas",
  unidad: "unidad",
  costo_unitario: 0,
  supplier_id: "",
  marca: "",
  espesor_mm: null,
  largo_mm: null,
  ancho_mm: null,
  tiene_veta: false,
  activo: true,
  favorito: false,
  observaciones: "",
};

const INITIAL_FILTERS: MaterialsQueryInput = {
  search: "",
  categoria: "",
  unidad: "",
  supplier_id: "",
  estado: "all",
  include_deleted: false,
};

interface MaterialSupplierOption {
  id: string;
  nombre: string;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

function mapMaterialToFormValues(material: MaterialRecord): MaterialFormInput {
  return {
    codigo: material.codigo,
    nombre: material.nombre,
    categoria: material.categoria as MaterialFormInput["categoria"],
    unidad: material.unidad as MaterialFormInput["unidad"],
    costo_unitario: Number(material.costo_unitario ?? 0),
    supplier_id: material.supplier_id ?? "",
    marca: material.marca ?? "",
    espesor_mm: material.espesor_mm ?? null,
    largo_mm: material.largo_mm ?? null,
    ancho_mm: material.ancho_mm ?? null,
    tiene_veta: Boolean(material.tiene_veta),
    activo: Boolean(material.activo),
    favorito: Boolean(material.favorito),
    observaciones: material.observaciones ?? "",
  };
}

function parseCsvFile(file: File): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (result.errors.length > 0) {
          reject(new Error(result.errors[0]?.message || "No se pudo leer el CSV."));
          return;
        }

        resolve((result.data ?? []) as Array<Record<string, unknown>>);
      },
      error: (error) => reject(error),
    });
  });
}

export function MaterialsModule() {
  const [materials, setMaterials] = useState<MaterialRecord[]>([]);
  const [suppliers, setSuppliers] = useState<MaterialSupplierOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );
  const [filters, setFilters] = useState<MaterialsQueryInput>(INITIAL_FILTERS);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<MaterialRecord | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<MaterialRecord | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const form = useForm<MaterialFormInput>({
    resolver: zodResolver(MaterialFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
    mode: "onChange",
  });

  const debouncedSearch = useDebouncedValue(filters.search || "", 300);

  const effectiveFilters = useMemo<MaterialsQueryInput>(
    () => ({
      ...filters,
      search: debouncedSearch,
    }),
    [debouncedSearch, filters],
  );

  const loadMaterials = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const records = await listMaterialsRecords(effectiveFilters);
      setMaterials(records);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [effectiveFilters]);

  const loadSuppliers = useCallback(async () => {
    try {
      const records = await listMaterialSuppliers();
      setSuppliers(records);
    } catch {
      setSuppliers([]);
    }
  }, []);

  useEffect(() => {
    void loadMaterials();
  }, [loadMaterials]);

  useEffect(() => {
    void loadSuppliers();
  }, [loadSuppliers]);

  const watchedLargoMm = form.watch("largo_mm");
  const watchedAnchoMm = form.watch("ancho_mm");
  const watchedCategoria = form.watch("categoria");
  const watchedActivo = form.watch("activo");
  const watchedTieneVeta = form.watch("tiene_veta");
  const watchedFavorito = form.watch("favorito");

  const areaPreview = useMemo(
    () => calculateMaterialAreaM2(watchedLargoMm, watchedAnchoMm),
    [watchedAnchoMm, watchedLargoMm],
  );

  const startCreate = () => {
    setEditingMaterial(null);
    setIsFormVisible(true);
    form.reset(DEFAULT_FORM_VALUES);
    setFeedback(null);
    setSaveState("idle");
  };

  const startEdit = (material: MaterialRecord) => {
    setEditingMaterial(material);
    setIsFormVisible(true);
    form.reset(mapMaterialToFormValues(material));
    setFeedback(null);
    setSaveState("idle");
  };

  const closeForm = () => {
    setEditingMaterial(null);
    setIsFormVisible(false);
    form.reset(DEFAULT_FORM_VALUES);
    setSaveState("idle");
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setIsSaving(true);
    setSaveState("saving");
    setFeedback(null);

    try {
      if (editingMaterial) {
        await updateMaterialRecord(editingMaterial.id, values);
        setFeedback({ type: "success", message: "Material actualizado correctamente." });
      } else {
        await createMaterialRecord(values);
        setFeedback({ type: "success", message: "Material creado correctamente." });
      }

      setSaveState("saved");
      closeForm();
      await loadMaterials();
    } catch (submitError) {
      setSaveState("error");
      setFeedback({ type: "error", message: getErrorMessage(submitError) });
    } finally {
      setIsSaving(false);
    }
  });

  const archiveMaterial = async () => {
    if (!archiveTarget) {
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      await archiveMaterialRecord(archiveTarget.id);
      setArchiveTarget(null);
      setFeedback({ type: "success", message: "Material archivado correctamente." });
      await loadMaterials();
    } catch (archiveError) {
      setFeedback({ type: "error", message: getErrorMessage(archiveError) });
    } finally {
      setIsSaving(false);
    }
  };

  const restoreMaterial = async (materialId: string) => {
    setIsSaving(true);
    setFeedback(null);

    try {
      await restoreMaterialRecord(materialId);
      setFeedback({ type: "success", message: "Material restaurado correctamente." });
      await loadMaterials();
    } catch (restoreError) {
      setFeedback({ type: "error", message: getErrorMessage(restoreError) });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleActive = async (materialId: string, active: boolean) => {
    setIsSaving(true);
    setFeedback(null);

    try {
      await toggleMaterialActiveRecord(materialId, active);
      setFeedback({
        type: "success",
        message: active ? "Material activado." : "Material marcado como inactivo.",
      });
      await loadMaterials();
    } catch (toggleError) {
      setFeedback({ type: "error", message: getErrorMessage(toggleError) });
    } finally {
      setIsSaving(false);
    }
  };

  const importCsv = async (file: File) => {
    setIsImporting(true);
    setFeedback(null);

    try {
      const rows = await parseCsvFile(file);
      const result = await importMaterialsCsvRecords(rows);

      const baseMessage = `Importacion finalizada. Creados: ${result.created}, actualizados: ${result.updated}, fallidos: ${result.failed}.`;
      const errorDetails =
        result.failed > 0 && result.errors.length > 0
          ? ` ${result.errors.slice(0, 3).map((item) => `Fila ${item.row}`).join(", ")}`
          : "";

      setFeedback({
        type: result.failed > 0 ? "error" : "success",
        message: `${baseMessage}${errorDetails}`,
      });

      await loadMaterials();
    } catch (importError) {
      setFeedback({ type: "error", message: getErrorMessage(importError) });
    } finally {
      setIsImporting(false);
    }
  };

  const columns: ColumnDef<MaterialRecord>[] = [
    {
      accessorKey: "nombre",
      header: "Material",
      cell: ({ row }) => {
        const material = row.original;
        return (
          <div>
            <p className="font-medium text-slate-900">{material.nombre}</p>
            <p className="text-xs text-slate-500">
              {material.codigo}
              {material.marca ? ` | ${material.marca}` : ""}
            </p>
          </div>
        );
      },
    },
    {
      accessorKey: "categoria",
      header: "Categoria",
      cell: ({ row }) => <Badge variant="secondary">{row.original.categoria}</Badge>,
    },
    {
      accessorKey: "unidad",
      header: "Unidad",
      cell: ({ row }) => row.original.unidad,
    },
    {
      accessorKey: "costo_unitario",
      header: "Costo unitario",
      cell: ({ row }) => <CurrencyCell value={Number(row.original.costo_unitario || 0)} />,
    },
    {
      accessorKey: "area_m2",
      header: "Dimensiones",
      cell: ({ row }) => {
        const material = row.original;
        const largo = material.largo_mm ?? 0;
        const ancho = material.ancho_mm ?? 0;
        const hasDimensions = largo > 0 && ancho > 0;

        if (!hasDimensions) {
          return <span className="text-sm text-slate-500">-</span>;
        }

        return (
          <div>
            <p className="text-sm text-slate-700">
              {formatMeasure(largo, 0)} x {formatMeasure(ancho, 0)}
            </p>
            <p className="text-xs text-slate-500">{formatArea(Number(material.area_m2 || 0), 4)}</p>
          </div>
        );
      },
    },
    {
      accessorKey: "supplier",
      header: "Proveedor",
      cell: ({ row }) => row.original.supplier?.nombre || "-",
    },
    {
      id: "status",
      header: "Estado",
      cell: ({ row }) => {
        const material = row.original;
        if (material.deleted_at) {
          return <StatusBadge status="inactive" label="Archivado" />;
        }

        return material.activo ? (
          <StatusBadge status="active" label="Activo" />
        ) : (
          <StatusBadge status="inactive" label="Inactivo" />
        );
      },
    },
    {
      id: "actions",
      header: "Acciones",
      cell: ({ row }) => {
        const material = row.original;
        const isArchived = Boolean(material.deleted_at);

        return (
          <div className="flex items-center gap-1">
            <Link
              href={`/materiales/${material.id}`}
              aria-label="Ver detalle"
              className={buttonVariants({ variant: "ghost", size: "icon" })}
            >
              <ExternalLink className="h-4 w-4" />
            </Link>

            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label="Editar"
              disabled={isArchived || isSaving}
              onClick={() => startEdit(material)}
            >
              <Pencil className="h-4 w-4" />
            </Button>

            <Switch
              checked={Boolean(material.activo)}
              disabled={isArchived || isSaving}
              onChange={(event) => void toggleActive(material.id, event.currentTarget.checked)}
            />

            {isArchived ? (
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label="Restaurar"
                disabled={isSaving}
                onClick={() => void restoreMaterial(material.id)}
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
                onClick={() => setArchiveTarget(material)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Materiales"
        description="CRUD completo de materiales con historial de precios y soporte para placas."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
            >
              <Upload className="mr-2 h-4 w-4" />
              {isImporting ? "Importando..." : "Importar CSV"}
            </Button>
            <Button onClick={startCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo material
            </Button>
          </>
        }
      />

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void importCsv(file);
          }
          event.currentTarget.value = "";
        }}
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
            placeholder="Buscar por nombre, codigo, marca u observaciones"
          />
        }
        filters={
          <>
            <Select
              value={filters.categoria || ""}
              onChange={(event) => setFilters((current) => ({ ...current, categoria: event.target.value }))}
              className="min-w-40"
            >
              <option value="">Todas las categorias</option>
              {MATERIAL_CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </Select>

            <Select
              value={filters.unidad || ""}
              onChange={(event) => setFilters((current) => ({ ...current, unidad: event.target.value }))}
              className="min-w-36"
            >
              <option value="">Todas las unidades</option>
              {MATERIAL_UNIT_OPTIONS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </Select>

            <Select
              value={filters.supplier_id || ""}
              onChange={(event) =>
                setFilters((current) => ({ ...current, supplier_id: event.target.value }))
              }
              className="min-w-44"
            >
              <option value="">Todos los proveedores</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.nombre}
                </option>
              ))}
            </Select>

            <Select
              value={filters.estado || "all"}
              onChange={(event) =>
                setFilters((current) => ({
                  ...current,
                  estado: event.target.value as MaterialsQueryInput["estado"],
                }))
              }
              className="min-w-32"
            >
              <option value="all">Todos</option>
              <option value="active">Activos</option>
              <option value="inactive">Inactivos</option>
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

      {error && !isLoading ? <ErrorState description={error} onRetry={() => void loadMaterials()} /> : null}

      <SectionCard title="Listado" description="Base maestra de materiales para costos y corte.">
        {isLoading ? (
          <LoadingState title="Cargando materiales" description="Consultando base de datos..." />
        ) : (
          <DataGrid<MaterialRecord>
            data={materials}
            columns={columns}
            hideSearch
            toolbarSlot={
              <span className="text-xs text-slate-500">
                {materials.filter((material) => !material.deleted_at).length} registros visibles
              </span>
            }
          />
        )}
      </SectionCard>

      {isFormVisible ? (
        <SectionCard
          title={editingMaterial ? `Editar: ${editingMaterial.nombre}` : "Nuevo material"}
          description="Todos los valores son editables y se guardan en Supabase."
          actions={<SaveIndicator state={saveState} />}
        >
          <form className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" onSubmit={onSubmit}>
            <FormFieldWrapper
              label="Codigo"
              required
              error={form.formState.errors.codigo?.message}
            >
              <Input {...form.register("codigo")} />
            </FormFieldWrapper>

            <FormFieldWrapper
              label="Nombre"
              required
              error={form.formState.errors.nombre?.message}
              className="xl:col-span-2"
            >
              <Input {...form.register("nombre")} />
            </FormFieldWrapper>

            <FormFieldWrapper
              label="Categoria"
              required
              error={form.formState.errors.categoria?.message}
            >
              <Select {...form.register("categoria")}>
                {MATERIAL_CATEGORY_OPTIONS.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </Select>
            </FormFieldWrapper>

            <FormFieldWrapper
              label="Unidad"
              required
              error={form.formState.errors.unidad?.message}
            >
              <Select {...form.register("unidad")}>
                {MATERIAL_UNIT_OPTIONS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </Select>
            </FormFieldWrapper>

            <FormFieldWrapper
              label="Costo unitario"
              required
              error={form.formState.errors.costo_unitario?.message}
              description={
                watchedCategoria === "placas"
                  ? "Para placas se interpreta como costo por placa completa."
                  : undefined
              }
            >
              <Input
                type="number"
                step="0.01"
                min={0}
                {...form.register("costo_unitario", {
                  setValueAs: (value) => (value === "" ? 0 : Number(value)),
                })}
              />
            </FormFieldWrapper>

            <FormFieldWrapper label="Proveedor" error={form.formState.errors.supplier_id?.message}>
              <Select {...form.register("supplier_id")}>
                <option value="">Sin proveedor</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.nombre}
                  </option>
                ))}
              </Select>
            </FormFieldWrapper>

            <FormFieldWrapper label="Marca" error={form.formState.errors.marca?.message}>
              <Input {...form.register("marca")} />
            </FormFieldWrapper>

            <FormFieldWrapper label="Espesor (mm)" error={form.formState.errors.espesor_mm?.message}>
              <Input
                type="number"
                step="0.1"
                min={0}
                {...form.register("espesor_mm", {
                  setValueAs: (value) => (value === "" ? null : Number(value)),
                })}
              />
            </FormFieldWrapper>

            <FormFieldWrapper label="Largo (mm)" error={form.formState.errors.largo_mm?.message}>
              <Input
                type="number"
                step="1"
                min={0}
                {...form.register("largo_mm", {
                  setValueAs: (value) => (value === "" ? null : Number(value)),
                })}
              />
            </FormFieldWrapper>

            <FormFieldWrapper label="Ancho (mm)" error={form.formState.errors.ancho_mm?.message}>
              <Input
                type="number"
                step="1"
                min={0}
                {...form.register("ancho_mm", {
                  setValueAs: (value) => (value === "" ? null : Number(value)),
                })}
              />
            </FormFieldWrapper>

            <FormFieldWrapper label="Area (m2)" description="Calculada automaticamente desde largo/ancho.">
              <Input value={areaPreview.toFixed(4)} readOnly disabled />
            </FormFieldWrapper>

            <FormFieldWrapper label="Activo">
              <Switch
                checked={Boolean(watchedActivo)}
                onChange={(event) =>
                  form.setValue("activo", event.currentTarget.checked, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
            </FormFieldWrapper>

            <FormFieldWrapper label="Tiene veta">
              <Switch
                checked={Boolean(watchedTieneVeta)}
                onChange={(event) =>
                  form.setValue("tiene_veta", event.currentTarget.checked, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
            </FormFieldWrapper>

            <FormFieldWrapper label="Favorito">
              <Switch
                checked={Boolean(watchedFavorito)}
                onChange={(event) =>
                  form.setValue("favorito", event.currentTarget.checked, {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
            </FormFieldWrapper>

            <FormFieldWrapper
              label="Observaciones"
              error={form.formState.errors.observaciones?.message}
              className="md:col-span-2 xl:col-span-4"
            >
              <Textarea rows={3} {...form.register("observaciones")} />
            </FormFieldWrapper>

            <div className="md:col-span-2 xl:col-span-4 flex items-center gap-2">
              <Button type="submit" disabled={isSaving || !form.formState.isValid}>
                {isSaving ? "Guardando..." : editingMaterial ? "Guardar cambios" : "Crear material"}
              </Button>
              <Button type="button" variant="secondary" onClick={closeForm} disabled={isSaving}>
                Cancelar
              </Button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <ConfirmDialog
        open={Boolean(archiveTarget)}
        title="Archivar material"
        description={
          archiveTarget
            ? `El material ${archiveTarget.nombre} dejara de aparecer en listados activos.`
            : undefined
        }
        confirmLabel="Archivar"
        cancelLabel="Cancelar"
        variant="danger"
        isLoading={isSaving}
        onConfirm={() => void archiveMaterial()}
        onCancel={() => setArchiveTarget(null)}
      />
    </div>
  );
}
