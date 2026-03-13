"use client";

import Link from "next/link";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import {
  archiveMaterialRecord,
  getMaterialDetailRecord,
  restoreMaterialRecord,
  toggleMaterialActiveRecord,
} from "@/features/materials/actions";
import type { MaterialDetailRecord } from "@/features/materials/types";
import { calculateMaterialCostPerM2 } from "@/domain/costing/materials";
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
} from "@/components/feedback";
import { PageHeader, PercentageBadge, SectionCard, StatusBadge } from "@/components/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatArea, formatCurrency, formatDate, formatMeasure } from "@/lib/utils";

interface MaterialDetailModuleProps {
  materialId: string;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

export function MaterialDetailModule({ materialId }: MaterialDetailModuleProps) {
  const [detail, setDetail] = useState<MaterialDetailRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );
  const [archiveOpen, setArchiveOpen] = useState(false);

  const loadDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await getMaterialDetailRecord(materialId);
      setDetail(response);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [materialId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const archiveMaterial = async () => {
    setIsMutating(true);
    setFeedback(null);

    try {
      await archiveMaterialRecord(materialId);
      setArchiveOpen(false);
      setFeedback({ type: "success", message: "Material archivado correctamente." });
      await loadDetail();
    } catch (archiveError) {
      setFeedback({ type: "error", message: getErrorMessage(archiveError) });
    } finally {
      setIsMutating(false);
    }
  };

  const restoreMaterial = async () => {
    setIsMutating(true);
    setFeedback(null);

    try {
      await restoreMaterialRecord(materialId);
      setFeedback({ type: "success", message: "Material restaurado correctamente." });
      await loadDetail();
    } catch (restoreError) {
      setFeedback({ type: "error", message: getErrorMessage(restoreError) });
    } finally {
      setIsMutating(false);
    }
  };

  const toggleActive = async (active: boolean) => {
    setIsMutating(true);
    setFeedback(null);

    try {
      await toggleMaterialActiveRecord(materialId, active);
      setFeedback({
        type: "success",
        message: active ? "Material activado." : "Material marcado como inactivo.",
      });
      await loadDetail();
    } catch (toggleError) {
      setFeedback({ type: "error", message: getErrorMessage(toggleError) });
    } finally {
      setIsMutating(false);
    }
  };

  if (isLoading) {
    return <LoadingState title="Cargando material" description="Buscando detalle e historial de precios..." />;
  }

  if (error) {
    return <ErrorState description={error} onRetry={() => void loadDetail()} />;
  }

  if (!detail) {
    return (
      <EmptyState
        title="Material no encontrado"
        description="No existe un material con ese identificador en tu cuenta."
        action={
          <Link href="/materiales" className={buttonVariants({ variant: "default" })}>
            Volver a materiales
          </Link>
        }
      />
    );
  }

  const { material, priceHistory } = detail;
  const area = Number(material.area_m2 || 0);
  const costoUnitario = Number(material.costo_unitario || 0);
  const costoPorM2 = calculateMaterialCostPerM2(costoUnitario, area);
  const isArchived = Boolean(material.deleted_at);

  return (
    <div className="space-y-4">
      <PageHeader
        title={material.nombre}
        description={`Codigo ${material.codigo} - Actualizado ${formatDate(material.updated_at)}`}
        actions={
          <>
            <Link href="/materiales" className={buttonVariants({ variant: "outline", size: "default" })}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver
            </Link>
            {isArchived ? (
              <Button onClick={() => void restoreMaterial()} disabled={isMutating}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Restaurar
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => void toggleActive(!material.activo)}
                  disabled={isMutating}
                >
                  {material.activo ? "Marcar inactivo" : "Marcar activo"}
                </Button>
                <Button variant="destructive" onClick={() => setArchiveOpen(true)} disabled={isMutating}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Archivar
                </Button>
              </>
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

      <SectionCard title="Datos del material" description="Informacion principal para costos y produccion.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Info label="Estado">
            {isArchived ? (
              <StatusBadge status="inactive" label="Archivado" />
            ) : material.activo ? (
              <StatusBadge status="active" label="Activo" />
            ) : (
              <StatusBadge status="inactive" label="Inactivo" />
            )}
          </Info>
          <Info label="Categoria">{material.categoria}</Info>
          <Info label="Unidad">{material.unidad}</Info>
          <Info label="Costo unitario">{formatCurrency(costoUnitario)}</Info>
          <Info label="Costo por m2">{area > 0 ? formatCurrency(costoPorM2) : "-"}</Info>
          <Info label="Proveedor">{material.supplier?.nombre || "-"}</Info>
          <Info label="Marca">{material.marca || "-"}</Info>
          <Info label="Espesor">{material.espesor_mm ? formatMeasure(material.espesor_mm, 1) : "-"}</Info>
          <Info label="Veta">{material.tiene_veta ? "Si" : "No"}</Info>
          <Info label="Dimensiones">
            {material.largo_mm && material.ancho_mm
              ? `${formatMeasure(material.largo_mm, 0)} x ${formatMeasure(material.ancho_mm, 0)}`
              : "-"}
          </Info>
          <Info label="Area">{formatArea(area, 4)}</Info>
          <Info label="Observaciones" className="sm:col-span-2 xl:col-span-3">
            {material.observaciones || "-"}
          </Info>
        </div>
      </SectionCard>

      <SectionCard
        title="Historial de precios"
        description="Cambios historicos registrados en material_price_history."
      >
        {priceHistory.length === 0 ? (
          <EmptyState
            title="Sin historial"
            description="Todavia no hay cambios de precio registrados para este material."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vigente desde</TableHead>
                <TableHead>Vigente hasta</TableHead>
                <TableHead>Precio anterior</TableHead>
                <TableHead>Precio nuevo</TableHead>
                <TableHead>Variacion</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {priceHistory.map((item) => {
                const oldPrice = Number(item.price_old || 0);
                const newPrice = Number(item.price_new || 0);
                const delta = newPrice - oldPrice;
                const deltaPct = oldPrice > 0 ? (delta / oldPrice) * 100 : newPrice > 0 ? 100 : 0;

                return (
                  <TableRow key={item.id}>
                    <TableCell>{formatDate(item.effective_from)}</TableCell>
                    <TableCell>{item.effective_to ? formatDate(item.effective_to) : "Actual"}</TableCell>
                    <TableCell>{formatCurrency(oldPrice)}</TableCell>
                    <TableCell>{formatCurrency(newPrice)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{formatCurrency(delta)}</span>
                        <PercentageBadge value={deltaPct} invertColor />
                      </div>
                    </TableCell>
                    <TableCell>{item.change_reason || "-"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <ConfirmDialog
        open={archiveOpen}
        title="Archivar material"
        description={`El material ${material.nombre} no aparecera en listados activos.`}
        confirmLabel="Archivar"
        cancelLabel="Cancelar"
        variant="danger"
        isLoading={isMutating}
        onConfirm={() => void archiveMaterial()}
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
