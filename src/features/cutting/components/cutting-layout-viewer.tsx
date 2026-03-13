"use client";

import { Layers3, ScanSearch, ZoomIn } from "lucide-react";
import { useMemo, useState } from "react";
import type { CuttingOptimizationResult } from "@/domain/cutting";
import type { CuttingMaterialOption } from "@/features/cutting/types";
import { EmptyState } from "@/components/feedback";
import { SectionCard } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, formatArea, formatCurrency, formatMeasure, formatPercent } from "@/lib/utils";
import { CuttingBoardSvg } from "./cutting-board-svg";
import { getBoardUtilizationBarClass } from "./cutting-render";

interface CuttingLayoutViewerProps {
  result: CuttingOptimizationResult | null;
  materialMap: Map<string, CuttingMaterialOption>;
}

export function CuttingLayoutViewer({ result, materialMap }: CuttingLayoutViewerProps) {
  const orderedBoards = useMemo(
    () => (result ? [...result.boards].sort((a, b) => a.boardIndex - b.boardIndex) : []),
    [result],
  );
  const [viewMode, setViewMode] = useState<"single" | "all">("single");
  const [selectedBoardKey, setSelectedBoardKey] = useState<string>("");
  const [zoomPct, setZoomPct] = useState(100);
  const effectiveSelectedBoardKey =
    orderedBoards.some((board) => board.boardKey === selectedBoardKey)
      ? selectedBoardKey
      : (orderedBoards[0]?.boardKey ?? "");

  const selectedBoard = useMemo(
    () => orderedBoards.find((board) => board.boardKey === effectiveSelectedBoardKey) ?? orderedBoards[0] ?? null,
    [effectiveSelectedBoardKey, orderedBoards],
  );

  if (!result) {
    return (
      <SectionCard title="Workspace de corte" description="Vista interactiva placa por placa y consolidada.">
        <EmptyState
          title="Sin layout generado"
          description="Ejecuta la optimizacion para visualizar placas, piezas y sobrantes."
        />
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Resumen del nesting" description="Indicadores globales de uso, desperdicio y rendimiento por trabajo.">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile label="Placas usadas" value={String(result.summary.boardsUsed)} helper={`${result.summary.piezasUbicadas} piezas ubicadas`} />
          <MetricTile label="Aprovechamiento" value={formatPercent(result.summary.aprovechamientoPct, 2)} helper={formatArea(result.summary.totalAreaUsadaMm2 / 1_000_000, 3)} />
          <MetricTile label="Desperdicio" value={formatPercent(result.summary.desperdicioPct, 2)} helper={formatArea(result.summary.totalAreaDesperdicioMm2 / 1_000_000, 3)} />
          <MetricTile label="Costo placas" value={formatCurrency(result.summary.costoPlacas)} helper={`${result.summary.totalCantoMetros.toFixed(2)} m de canto`} />
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <PercentBar
            label="Uso global"
            value={result.summary.aprovechamientoPct}
            className={getBoardUtilizationBarClass(result.summary.aprovechamientoPct)}
          />
          <PercentBar
            label="Desperdicio global"
            value={result.summary.desperdicioPct}
            className={result.summary.desperdicioPct <= 20 ? "bg-emerald-500" : "bg-rose-500"}
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Workspace de placas"
        description="Modo placa por placa o vista consolidada con zoom y selector."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={viewMode === "single" ? "default" : "outline"}
              onClick={() => setViewMode("single")}
            >
              <ScanSearch className="mr-2 h-4 w-4" />
              Una placa
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "all" ? "default" : "outline"}
              onClick={() => setViewMode("all")}
            >
              <Layers3 className="mr-2 h-4 w-4" />
              Todas
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)_220px]">
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Selector</p>
                <p className="mt-1 text-sm text-slate-600">Elige una placa para revisar su layout y posiciones.</p>
              </div>

                <Select
                value={effectiveSelectedBoardKey}
                onChange={(event) => setSelectedBoardKey(event.target.value)}
                disabled={viewMode === "all"}
              >
                {orderedBoards.map((board) => {
                  const material = materialMap.get(board.materialId);
                  return (
                    <option key={board.boardKey} value={board.boardKey}>
                      {board.boardLabel} | {material?.codigo || "MAT"} | {formatPercent(board.aprovechamientoPct, 1)}
                    </option>
                  );
                })}
              </Select>

              <Separator />

              <div>
                <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <ZoomIn className="h-3.5 w-3.5" />
                    Zoom
                  </span>
                  <span>{zoomPct}%</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={180}
                  step={10}
                  value={zoomPct}
                  onChange={(event) => setZoomPct(Number(event.target.value))}
                  className="w-full accent-slate-900"
                />
              </div>

              <Separator />

              <div className="space-y-2">
                {orderedBoards.map((board) => {
                  const material = materialMap.get(board.materialId);
                  return (
                    <button
                      key={board.boardKey}
                      type="button"
                      onClick={() => {
                        setSelectedBoardKey(board.boardKey);
                        setViewMode("single");
                      }}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left transition",
                        selectedBoard?.boardKey === board.boardKey
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium">{board.boardLabel}</span>
                        <Badge variant={selectedBoard?.boardKey === board.boardKey ? "secondary" : "secondary"}>
                          {board.placements.length}
                        </Badge>
                      </div>
                      <p className={cn("mt-1 text-xs", selectedBoard?.boardKey === board.boardKey ? "text-slate-200" : "text-slate-500")}>
                        {material?.codigo || "MAT"} | {formatPercent(board.aprovechamientoPct, 2)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              {viewMode === "single" && selectedBoard ? (
                <CuttingBoardSvg
                  board={selectedBoard}
                  material={materialMap.get(selectedBoard.materialId)}
                  zoomPct={zoomPct}
                />
              ) : null}

              {viewMode === "all" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  {orderedBoards.map((board) => (
                    <div key={board.boardKey} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{board.boardLabel}</p>
                          <p className="text-xs text-slate-500">
                            {materialMap.get(board.materialId)?.codigo || "MAT"} | {formatPercent(board.aprovechamientoPct, 2)}
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedBoardKey(board.boardKey);
                            setViewMode("single");
                          }}
                        >
                          Ver
                        </Button>
                      </div>
                      <CuttingBoardSvg
                        board={board}
                        material={materialMap.get(board.materialId)}
                        compact
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              {selectedBoard ? (
                <>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Placa activa</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">{selectedBoard.boardLabel}</p>
                    <p className="text-xs text-slate-500">
                      {materialMap.get(selectedBoard.materialId)?.nombre || selectedBoard.materialId}
                    </p>
                  </div>

                  <MetricRow label="Uso" value={formatPercent(selectedBoard.aprovechamientoPct, 2)} />
                  <MetricRow label="Desperdicio" value={formatPercent(100 - selectedBoard.aprovechamientoPct, 2)} />
                  <MetricRow label="Costo placa" value={formatCurrency(selectedBoard.costoPlaca)} />
                  <MetricRow label="Piezas" value={String(selectedBoard.placements.length)} />
                  <MetricRow label="Sobrantes" value={String(selectedBoard.offcuts.length)} />
                  <MetricRow label="Area usada" value={formatArea(selectedBoard.areaUsadaMm2 / 1_000_000, 3)} />

                  <PercentBar
                    label="Uso de placa"
                    value={selectedBoard.aprovechamientoPct}
                    className={getBoardUtilizationBarClass(selectedBoard.aprovechamientoPct)}
                  />
                </>
              ) : (
                <EmptyState title="Sin placas" description="No hay placas optimizadas para mostrar." />
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      {selectedBoard ? (
        <SectionCard
          title={`Detalle ${selectedBoard.boardLabel}`}
          description="Posiciones, orientacion, veta y canto de la placa seleccionada."
          actions={<Badge variant="secondary">{selectedBoard.placements.length} piezas</Badge>}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pieza</TableHead>
                <TableHead>Inst.</TableHead>
                <TableHead>Posicion</TableHead>
                <TableHead>Medidas</TableHead>
                <TableHead>Orientacion</TableHead>
                <TableHead>Veta</TableHead>
                <TableHead>Canto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {selectedBoard.placements.map((placement) => (
                <TableRow key={placement.placementId}>
                  <TableCell className="font-medium text-slate-900">{placement.sourcePartName}</TableCell>
                  <TableCell>#{placement.sourceInstance}</TableCell>
                  <TableCell>
                    {formatMeasure(placement.x, 0)} , {formatMeasure(placement.y, 0)}
                  </TableCell>
                  <TableCell>
                    {formatMeasure(placement.width, 0)} x {formatMeasure(placement.height, 0)}
                  </TableCell>
                  <TableCell>{placement.orientation === "rotated" ? "Rotada" : "Normal"}</TableCell>
                  <TableCell>{placement.grainDirection === "vertical" ? "Vertical" : "Horizontal"}</TableCell>
                  <TableCell>{placement.cantoMetros.toFixed(2)} m</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      ) : null}

      {result.unplaced.length > 0 ? (
        <SectionCard title="Piezas sin ubicar" description="Piezas imposibles de acomodar en la optimizacion actual.">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pieza</TableHead>
                <TableHead>Instancia</TableHead>
                <TableHead>Material</TableHead>
                <TableHead>Medidas</TableHead>
                <TableHead>Motivo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.unplaced.map((item) => (
                <TableRow key={`${item.sourcePartId}:${item.sourceInstance}:${item.reason}`}>
                  <TableCell className="font-medium text-slate-900">{item.sourcePartName}</TableCell>
                  <TableCell>#{item.sourceInstance}</TableCell>
                  <TableCell>{materialMap.get(item.materialId)?.nombre || item.materialId || "-"}</TableCell>
                  <TableCell>
                    {formatMeasure(item.width, 0)} x {formatMeasure(item.height, 0)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="danger">{reasonLabel(item.reason)}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      ) : null}
    </div>
  );
}

function MetricTile({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{helper}</p>
    </div>
  );
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}

function PercentBar({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
        <span>{label}</span>
        <span>{formatPercent(value, 2)}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200">
        <div className={cn("h-2 rounded-full transition-all", className)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function reasonLabel(reason: CuttingOptimizationResult["unplaced"][number]["reason"]) {
  if (reason === "too_large_for_board") {
    return "No entra en placa";
  }
  if (reason === "invalid_material") {
    return "Material invalido";
  }
  if (reason === "invalid_part") {
    return "Datos invalidos";
  }

  return "Sin espacio";
}
