"use client";

import Link from "next/link";
import { ArrowLeft, ClipboardList, FolderKanban, RotateCcw, Trash2 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
  archiveClientRecord,
  getClientDetailRecord,
  restoreClientRecord,
} from "@/features/clients/actions";
import type { ClientDetailRecord } from "@/features/clients/types";
import { ConfirmDialog, EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { PageHeader, SectionCard, StatusBadge } from "@/components/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";

interface ClientDetailModuleProps {
  clientId: string;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

export function ClientDetailModule({ clientId }: ClientDetailModuleProps) {
  const [detail, setDetail] = useState<ClientDetailRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const loadDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await getClientDetailRecord(clientId);
      setDetail(response);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const archiveClient = async () => {
    setIsMutating(true);
    setFeedback(null);

    try {
      await archiveClientRecord(clientId);
      setArchiveOpen(false);
      setFeedback({ type: "success", message: "Cliente archivado correctamente." });
      await loadDetail();
    } catch (archiveError) {
      setFeedback({ type: "error", message: getErrorMessage(archiveError) });
    } finally {
      setIsMutating(false);
    }
  };

  const restoreClient = async () => {
    setIsMutating(true);
    setFeedback(null);

    try {
      await restoreClientRecord(clientId);
      setFeedback({ type: "success", message: "Cliente restaurado correctamente." });
      await loadDetail();
    } catch (restoreError) {
      setFeedback({ type: "error", message: getErrorMessage(restoreError) });
    } finally {
      setIsMutating(false);
    }
  };

  if (isLoading) {
    return <LoadingState title="Cargando cliente" description="Buscando datos e historial relacionado..." />;
  }

  if (error) {
    return <ErrorState description={error} onRetry={() => void loadDetail()} />;
  }

  if (!detail) {
    return (
      <EmptyState
        title="Cliente no encontrado"
        description="No existe un cliente con ese identificador en tu cuenta."
        action={
          <Link href="/clientes" className={buttonVariants({ variant: "default" })}>
            Volver a clientes
          </Link>
        }
      />
    );
  }

  const { client, budgets, projects } = detail;

  return (
    <div className="space-y-4">
      <PageHeader
        title={client.nombre}
        description={`Cliente #${client.id.slice(0, 8)} - Alta ${formatDate(client.fecha_alta || "")}`}
        actions={
          <>
            <Link href="/clientes" className={buttonVariants({ variant: "outline", size: "default" })}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver
            </Link>
            <Link
              href={`/proyectos?client_id=${client.id}`}
              className={buttonVariants({ variant: "outline", size: "default" })}
            >
              <FolderKanban className="mr-2 h-4 w-4" />
              Nuevo proyecto
            </Link>
            <Link
              href={`/presupuestos?client_id=${client.id}`}
              className={buttonVariants({ variant: "outline", size: "default" })}
            >
              <ClipboardList className="mr-2 h-4 w-4" />
              Nuevo presupuesto
            </Link>
            {client.deleted_at ? (
              <Button onClick={() => void restoreClient()} disabled={isMutating}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Restaurar
              </Button>
            ) : (
              <Button variant="destructive" onClick={() => setArchiveOpen(true)} disabled={isMutating}>
                <Trash2 className="mr-2 h-4 w-4" />
                Archivar
              </Button>
            )}
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

      <SectionCard title="Datos del cliente" description="Informacion principal y estado actual.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Info label="Estado">
            {client.deleted_at ? <StatusBadge status="inactive" label="Archivado" /> : <StatusBadge status="active" label="Activo" />}
          </Info>
          <Info label="Telefono">{client.telefono || "-"}</Info>
          <Info label="Email">{client.email || "-"}</Info>
          <Info label="Direccion">{client.direccion || "-"}</Info>
          <Info label="Ciudad">{client.ciudad || "-"}</Info>
          <Info label="Provincia">{client.provincia || "-"}</Info>
          <Info label="Canal ingreso">{client.canal_ingreso || "-"}</Info>
          <Info label="Fecha alta">{formatDate(client.fecha_alta || "")}</Info>
          <Info label="Saldo pendiente">{formatCurrency(Number(client.saldo_pendiente || 0))}</Info>
          <Info label="Notas" className="sm:col-span-2 xl:col-span-3">
            {client.notas || "-"}
          </Info>
        </div>
      </SectionCard>

      <SectionCard title="Historial de presupuestos" description="Presupuestos vinculados al cliente.">
        {budgets.length === 0 ? (
          <EmptyState title="Sin presupuestos" description="Este cliente todavia no tiene presupuestos registrados." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Numero</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budgets.map((budget) => (
                <TableRow key={budget.id}>
                  <TableCell>{budget.budget_number || budget.id.slice(0, 8)}</TableCell>
                  <TableCell>
                    <StatusBadge status={budget.estado} />
                  </TableCell>
                  <TableCell>{formatDate(budget.fecha_emision)}</TableCell>
                  <TableCell>{formatCurrency(Number(budget.total_snapshot || 0))}</TableCell>
                  <TableCell>{formatCurrency(Number(budget.saldo_snapshot || 0))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <SectionCard title="Historial de proyectos" description="Proyectos a medida vinculados al cliente.">
        {projects.length === 0 ? (
          <EmptyState title="Sin proyectos" description="Este cliente todavia no tiene proyectos registrados." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proyecto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Costo</TableHead>
                <TableHead>Precio sugerido</TableHead>
                <TableHead>Utilidad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell>{project.nombre_proyecto}</TableCell>
                  <TableCell>
                    <StatusBadge status={project.status} />
                  </TableCell>
                  <TableCell>{formatDate(project.fecha)}</TableCell>
                  <TableCell>{formatCurrency(Number(project.costo_total || 0))}</TableCell>
                  <TableCell>{formatCurrency(Number(project.precio_sugerido || 0))}</TableCell>
                  <TableCell>{formatCurrency(Number(project.utilidad_estimada || 0))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <ConfirmDialog
        open={archiveOpen}
        title="Archivar cliente"
        description={`El cliente ${client.nombre} no aparecera en listados activos.`}
        confirmLabel="Archivar"
        cancelLabel="Cancelar"
        variant="danger"
        isLoading={isMutating}
        onConfirm={() => void archiveClient()}
        onCancel={() => setArchiveOpen(false)}
      />
    </div>
  );
}

function Info({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 text-sm text-slate-900">{children}</div>
    </div>
  );
}
