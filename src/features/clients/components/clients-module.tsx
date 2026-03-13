"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { ExternalLink, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  archiveClientRecord,
  createClientRecord,
  listClientsRecords,
  restoreClientRecord,
  updateClientRecord,
} from "@/features/clients/actions";
import { ClientFormSchema, type ClientFormInput, type ClientsQueryInput } from "@/features/clients/schemas";
import type { ClientRecord } from "@/features/clients/types";
import {
  ConfirmDialog,
  ErrorState,
  LoadingState,
  SaveIndicator,
} from "@/components/feedback";
import { FilterBar, FormFieldWrapper, SearchInput } from "@/components/forms";
import { PageHeader, SectionCard, StatusBadge } from "@/components/shared";
import { DataGrid } from "@/components/tables";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatDate } from "@/lib/utils";

const DEFAULT_FORM_VALUES: ClientFormInput = {
  nombre: "",
  telefono: "",
  email: "",
  direccion: "",
  ciudad: "",
  provincia: "",
  notas: "",
  canal_ingreso: "",
  fecha_alta: new Date().toISOString().slice(0, 10),
};

const INITIAL_FILTERS: ClientsQueryInput = {
  search: "",
  ciudad: "",
  canal_ingreso: "",
  include_deleted: false,
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

function mapClientToFormValues(client: ClientRecord): ClientFormInput {
  return {
    nombre: client.nombre,
    telefono: client.telefono || "",
    email: client.email || "",
    direccion: client.direccion || "",
    ciudad: client.ciudad || "",
    provincia: client.provincia || "",
    notas: client.notas || "",
    canal_ingreso: client.canal_ingreso || "",
    fecha_alta: client.fecha_alta || "",
  };
}

export function ClientsModule() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [filters, setFilters] = useState<ClientsQueryInput>(INITIAL_FILTERS);
  const [isFormVisible, setIsFormVisible] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientRecord | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ClientRecord | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const form = useForm<ClientFormInput>({
    resolver: zodResolver(ClientFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
    mode: "onChange",
  });

  const debouncedSearch = useDebouncedValue(filters.search || "", 300);

  const effectiveFilters = useMemo<ClientsQueryInput>(
    () => ({
      ...filters,
      search: debouncedSearch,
    }),
    [debouncedSearch, filters],
  );

  const loadClients = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const records = await listClientsRecords(effectiveFilters);
      setClients(records);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [effectiveFilters]);

  useEffect(() => {
    void loadClients();
  }, [loadClients]);

  const cityOptions = useMemo(
    () =>
      Array.from(new Set(clients.map((client) => client.ciudad).filter((value): value is string => Boolean(value)))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [clients],
  );

  const channelOptions = useMemo(
    () =>
      Array.from(
        new Set(clients.map((client) => client.canal_ingreso).filter((value): value is string => Boolean(value))),
      ).sort((a, b) => a.localeCompare(b)),
    [clients],
  );

  const startCreate = () => {
    setEditingClient(null);
    setIsFormVisible(true);
    form.reset(DEFAULT_FORM_VALUES);
    setFeedback(null);
    setSaveState("idle");
  };

  const startEdit = (client: ClientRecord) => {
    setEditingClient(client);
    setIsFormVisible(true);
    form.reset(mapClientToFormValues(client));
    setFeedback(null);
    setSaveState("idle");
  };

  const closeForm = () => {
    setEditingClient(null);
    setIsFormVisible(false);
    form.reset(DEFAULT_FORM_VALUES);
    setSaveState("idle");
  };

  const onSubmit = form.handleSubmit(async (values) => {
    setIsSaving(true);
    setSaveState("saving");
    setFeedback(null);

    try {
      if (editingClient) {
        await updateClientRecord(editingClient.id, values);
        setFeedback({ type: "success", message: "Cliente actualizado correctamente." });
      } else {
        await createClientRecord(values);
        setFeedback({ type: "success", message: "Cliente creado correctamente." });
      }

      setSaveState("saved");
      closeForm();
      await loadClients();
    } catch (submitError) {
      setSaveState("error");
      setFeedback({ type: "error", message: getErrorMessage(submitError) });
    } finally {
      setIsSaving(false);
    }
  });

  const confirmArchive = async () => {
    if (!deleteTarget) {
      return;
    }

    setIsSaving(true);
    setFeedback(null);

    try {
      await archiveClientRecord(deleteTarget.id);
      setFeedback({ type: "success", message: "Cliente archivado correctamente." });
      setDeleteTarget(null);
      await loadClients();
    } catch (archiveError) {
      setFeedback({ type: "error", message: getErrorMessage(archiveError) });
    } finally {
      setIsSaving(false);
    }
  };

  const restoreClient = async (clientId: string) => {
    setIsSaving(true);
    setFeedback(null);

    try {
      await restoreClientRecord(clientId);
      setFeedback({ type: "success", message: "Cliente restaurado correctamente." });
      await loadClients();
    } catch (restoreError) {
      setFeedback({ type: "error", message: getErrorMessage(restoreError) });
    } finally {
      setIsSaving(false);
    }
  };

  const columns: ColumnDef<ClientRecord>[] = [
      {
        accessorKey: "nombre",
        header: "Cliente",
        cell: ({ row }) => {
          const client = row.original;
          return (
            <div>
              <p className="font-medium text-slate-900">{client.nombre}</p>
              <p className="text-xs text-slate-500">{client.email || "Sin email"}</p>
            </div>
          );
        },
      },
      {
        accessorKey: "telefono",
        header: "Contacto",
        cell: ({ row }) => {
          const client = row.original;
          return (
            <div>
              <p className="text-sm text-slate-700">{client.telefono || "-"}</p>
              <p className="text-xs text-slate-500">{client.canal_ingreso || "Sin canal"}</p>
            </div>
          );
        },
      },
      {
        accessorKey: "ciudad",
        header: "Ubicacion",
        cell: ({ row }) => {
          const client = row.original;
          return `${client.ciudad || "-"}${client.provincia ? `, ${client.provincia}` : ""}`;
        },
      },
      {
        accessorKey: "fecha_alta",
        header: "Fecha alta",
        cell: ({ row }) => formatDate(row.original.fecha_alta || ""),
      },
      {
        id: "status",
        header: "Estado",
        cell: ({ row }) =>
          row.original.deleted_at ? (
            <StatusBadge status="inactive" label="Archivado" />
          ) : (
            <StatusBadge status="active" label="Activo" />
          ),
      },
      {
        id: "actions",
        header: "Acciones",
        cell: ({ row }) => {
          const client = row.original;

          return (
            <div className="flex items-center gap-1">
              <Link
                href={`/clientes/${client.id}`}
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
                disabled={Boolean(client.deleted_at)}
                onClick={() => startEdit(client)}
              >
                <Pencil className="h-4 w-4" />
              </Button>

              {client.deleted_at ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Restaurar"
                  onClick={() => void restoreClient(client.id)}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Archivar"
                  onClick={() => setDeleteTarget(client)}
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
        title="Clientes"
        description="CRUD completo de clientes con historial relacionado y baja logica."
        actions={
          <Button onClick={startCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nuevo cliente
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

      <FilterBar
        search={
          <SearchInput
            className="w-full"
            value={filters.search || ""}
            onChange={(value) => setFilters((current) => ({ ...current, search: value }))}
            placeholder="Buscar por nombre, email, telefono o ubicacion"
          />
        }
        filters={
          <>
            <Select
              value={filters.ciudad || ""}
              onChange={(event) => setFilters((current) => ({ ...current, ciudad: event.target.value }))}
              className="min-w-44"
            >
              <option value="">Todas las ciudades</option>
              {cityOptions.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </Select>

            <Select
              value={filters.canal_ingreso || ""}
              onChange={(event) => setFilters((current) => ({ ...current, canal_ingreso: event.target.value }))}
              className="min-w-44"
            >
              <option value="">Todos los canales</option>
              {channelOptions.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </Select>

            <div className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5">
              <Switch
                checked={Boolean(filters.include_deleted)}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, include_deleted: event.currentTarget.checked }))
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

      {error && !isLoading ? <ErrorState description={error} onRetry={() => void loadClients()} /> : null}

      <SectionCard title="Listado" description="Clientes registrados en la cuenta actual.">
        {isLoading ? (
          <LoadingState title="Cargando clientes" description="Consultando base de datos..." />
        ) : (
          <DataGrid<ClientRecord>
            data={clients}
            columns={columns}
            hideSearch
            toolbarSlot={
              <span className="text-xs text-slate-500">{clients.filter((client) => !client.deleted_at).length} activos</span>
            }
          />
        )}
      </SectionCard>

      {isFormVisible ? (
        <SectionCard
          title={editingClient ? `Editar: ${editingClient.nombre}` : "Nuevo cliente"}
          description="Completa los datos y guarda para persistir cambios en Supabase."
          actions={<SaveIndicator state={saveState} />}
        >
          <form className="grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
            <FormFieldWrapper
              label="Nombre"
              required
              error={form.formState.errors.nombre?.message}
            >
              <Input {...form.register("nombre")} />
            </FormFieldWrapper>

            <FormFieldWrapper label="Telefono" error={form.formState.errors.telefono?.message}>
              <Input {...form.register("telefono")} />
            </FormFieldWrapper>

            <FormFieldWrapper label="Email" error={form.formState.errors.email?.message}>
              <Input type="email" {...form.register("email")} />
            </FormFieldWrapper>

            <FormFieldWrapper label="Canal de ingreso" error={form.formState.errors.canal_ingreso?.message}>
              <Input {...form.register("canal_ingreso")} />
            </FormFieldWrapper>

            <FormFieldWrapper label="Direccion" error={form.formState.errors.direccion?.message} className="md:col-span-2">
              <Input {...form.register("direccion")} />
            </FormFieldWrapper>

            <FormFieldWrapper label="Ciudad" error={form.formState.errors.ciudad?.message}>
              <Input {...form.register("ciudad")} />
            </FormFieldWrapper>

            <FormFieldWrapper label="Provincia" error={form.formState.errors.provincia?.message}>
              <Input {...form.register("provincia")} />
            </FormFieldWrapper>

            <FormFieldWrapper label="Fecha alta" error={form.formState.errors.fecha_alta?.message}>
              <Input type="date" {...form.register("fecha_alta")} />
            </FormFieldWrapper>

            <FormFieldWrapper label="Notas" error={form.formState.errors.notas?.message} className="md:col-span-2">
              <Textarea rows={3} {...form.register("notas")} />
            </FormFieldWrapper>

            <div className="md:col-span-2 flex items-center gap-2">
              <Button type="submit" disabled={isSaving || !form.formState.isValid}>
                {isSaving ? "Guardando..." : editingClient ? "Guardar cambios" : "Crear cliente"}
              </Button>
              <Button type="button" variant="secondary" onClick={closeForm} disabled={isSaving}>
                Cancelar
              </Button>
            </div>
          </form>
        </SectionCard>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Archivar cliente"
        description={
          deleteTarget
            ? `El cliente ${deleteTarget.nombre} dejara de aparecer en el listado activo.`
            : undefined
        }
        confirmLabel="Archivar"
        cancelLabel="Cancelar"
        variant="danger"
        isLoading={isSaving}
        onConfirm={() => void confirmArchive()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
