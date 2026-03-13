import { round } from "@/lib/utils";
import { nestRectangles2D } from "./nesting-2d";
import type {
  CuttingBoardLayout,
  CuttingJobParamsInput,
  CuttingMaterialContext,
  CuttingOptimizationResult,
  CuttingPartInput,
  CuttingUnplacedPart,
} from "./types";

export interface OptimizeCuttingInput {
  parts: CuttingPartInput[];
  params: CuttingJobParamsInput;
  materials: CuttingMaterialContext[];
  iteration?: number;
}

function normalizeNonNegative(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function normalizeNullableNonNegative(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, value);
}

function buildMaterialGroupKey(materialId: string, espesorMm: number | null) {
  if (!materialId.trim()) {
    return "";
  }

  return `${materialId}::${espesorMm === null ? "null" : espesorMm}`;
}

function parseMaterialGroupKey(groupKey: string) {
  if (!groupKey.includes("::")) {
    return {
      materialId: groupKey,
      espesorMm: null,
    };
  }

  const [materialId, espesorRaw] = groupKey.split("::");
  return {
    materialId,
    espesorMm: espesorRaw === "null" ? null : normalizeNullableNonNegative(Number(espesorRaw)),
  };
}

function estimateEdgeMeters(cantoRequerido: string, widthMm: number, heightMm: number) {
  const input = cantoRequerido.trim().toLowerCase();
  if (!input) {
    return 0;
  }

  const perimeterMeters = ((widthMm + heightMm) * 2) / 1000;
  const compact = input.replace(/\s+/g, "");

  if (compact.includes("todo") || compact.includes("4lados") || compact.includes("completo")) {
    return perimeterMeters;
  }

  const largoMatch = compact.match(/(\d+)(l|largo)/);
  const anchoMatch = compact.match(/(\d+)(a|ancho)/);

  if (largoMatch || anchoMatch) {
    const largoCount = largoMatch ? Number(largoMatch[1]) : 0;
    const anchoCount = anchoMatch ? Number(anchoMatch[1]) : 0;
    return (largoCount * widthMm + anchoCount * heightMm) / 1000;
  }

  const numericOnly = compact.match(/^\d+$/);
  if (numericOnly) {
    const sideCount = Math.min(4, Math.max(0, Number(numericOnly[0])));
    return (perimeterMeters / 4) * sideCount;
  }

  if (compact.includes("largo") || compact.includes("ancho") || compact.includes("canto")) {
    return perimeterMeters;
  }

  return perimeterMeters;
}

function getBoardCost(material: CuttingMaterialContext | undefined, largoPlacaMm: number, anchoPlacaMm: number) {
  if (!material) {
    return 0;
  }

  const unit = material.unidad.trim().toLowerCase();
  const boardAreaM2 = (largoPlacaMm * anchoPlacaMm) / 1_000_000;
  const unitCost = normalizeNonNegative(material.costoUnitario);

  if (unit === "unidad" || unit === "placa") {
    return unitCost;
  }

  if (unit === "m2") {
    return unitCost * boardAreaM2;
  }

  if (material.areaM2 && material.areaM2 > 0) {
    return (boardAreaM2 / material.areaM2) * unitCost;
  }

  return unitCost * boardAreaM2;
}

function mapUnplacedReason(
  reason: "invalid_piece" | "too_large_for_board" | "no_space_available",
  source: CuttingPartInput | undefined,
): CuttingUnplacedPart["reason"] {
  if (reason === "invalid_piece") {
    return source?.materialId?.trim() ? "invalid_part" : "invalid_material";
  }

  return reason;
}

export function optimizeCuttingJob(input: OptimizeCuttingInput): CuttingOptimizationResult {
  const iteration = input.iteration ?? 1;
  const params: CuttingJobParamsInput = {
    ...input.params,
    largoPlacaMm: normalizeNonNegative(input.params.largoPlacaMm),
    anchoPlacaMm: normalizeNonNegative(input.params.anchoPlacaMm),
    kerfMm: normalizeNonNegative(input.params.kerfMm),
    margenPerimetralMm: normalizeNonNegative(input.params.margenPerimetralMm),
    desperdicioExtraPct: normalizeNonNegative(input.params.desperdicioExtraPct),
  };

  const partMap = new Map(input.parts.map((part) => [part.id, part]));
  const materialMap = new Map(input.materials.map((material) => [material.id, material]));
  const upfrontUnplaced: CuttingUnplacedPart[] = [];
  const validParts: CuttingPartInput[] = [];

  for (const part of input.parts) {
    const quantity = Math.max(0, Math.floor(part.cantidad || 0));
    const materialId = part.materialId?.trim() || "";

    if (!materialId || !materialMap.has(materialId)) {
      const instances = Math.max(1, quantity);
      for (let sourceInstance = 1; sourceInstance <= instances; sourceInstance += 1) {
        upfrontUnplaced.push({
          sourcePartId: part.id,
          sourcePartName: part.nombrePieza,
          sourceInstance,
          materialId,
          espesorMm: normalizeNullableNonNegative(part.espesorMm),
          width: normalizeNonNegative(part.largoMm),
          height: normalizeNonNegative(part.anchoMm),
          reason: "invalid_material",
        });
      }
      continue;
    }

    validParts.push(part);
  }

  const nestingResult = nestRectangles2D({
    board: {
      widthMm: params.largoPlacaMm,
      heightMm: params.anchoPlacaMm,
    },
    params: {
      kerfMm: params.kerfMm,
      marginMm: params.margenPerimetralMm,
    },
    pieces: validParts.map((part) => ({
      id: part.id,
      nombre: part.nombrePieza,
      widthMm: normalizeNonNegative(part.largoMm),
      heightMm: normalizeNonNegative(part.anchoMm),
      quantity: Math.max(0, Math.floor(normalizeNonNegative(part.cantidad))),
      rotatable: Boolean(part.rotacionPermitida),
      grainDirectionRequired: Boolean(part.vetaObligatoria),
      materialGroup: buildMaterialGroupKey(part.materialId || "", part.espesorMm ?? null),
    })),
  });

  const boards: CuttingBoardLayout[] = nestingResult.boards.map((board) => {
    const { materialId, espesorMm } = parseMaterialGroupKey(board.materialGroup);
    const sourceMaterial = materialMap.get(materialId);

    return {
      boardKey: `${board.materialGroup}:${board.boardIndex}`,
      boardIndex: board.boardIndex,
      boardLabel: `Placa ${board.boardIndex}`,
      materialId,
      espesorMm,
      largoPlacaMm: board.widthMm,
      anchoPlacaMm: board.heightMm,
      areaUtilMm2: board.areaTotalMm2,
      areaUsadaMm2: board.areaUsadaMm2,
      areaDesperdicioMm2: round(Math.max(board.areaTotalMm2 - board.areaUsadaMm2, 0), 3),
      aprovechamientoPct: board.aprovechamientoPct,
      costoPlaca: round(getBoardCost(sourceMaterial, board.widthMm, board.heightMm), 2),
      placements: board.placements.map((placement) => {
        const sourcePart = partMap.get(placement.pieceId);
        return {
          placementId: placement.instanceId,
          sourcePartId: placement.pieceId,
          sourcePartName: placement.nombre,
          sourceInstance: placement.instanceIndex,
          materialId,
          espesorMm,
          x: placement.x,
          y: placement.y,
          width: placement.widthMm,
          height: placement.heightMm,
          orientation: placement.orientation,
          grainDirection: placement.grainDirection,
          priority: sourcePart?.prioridad ?? 3,
          blocked: sourcePart?.bloqueada ?? false,
          cantoRequerido: sourcePart?.cantoRequerido ?? "",
          cantoMetros: round(
            estimateEdgeMeters(sourcePart?.cantoRequerido ?? "", placement.widthMm, placement.heightMm),
            4,
          ),
          observacion: sourcePart?.observacion ?? "",
        };
      }),
      offcuts: board.freeRects.map((freeRect) => ({
        x: freeRect.x,
        y: freeRect.y,
        width: freeRect.widthMm,
        height: freeRect.heightMm,
        areaMm2: freeRect.areaMm2,
      })),
    };
  });

  const unplaced: CuttingUnplacedPart[] = nestingResult.unplaced.map((item) => {
    const sourcePart = partMap.get(item.pieceId);
    const { materialId, espesorMm } = parseMaterialGroupKey(item.materialGroup);
    return {
      sourcePartId: item.pieceId,
      sourcePartName: item.nombre,
      sourceInstance: item.instanceIndex,
      materialId,
      espesorMm,
      width: item.widthMm,
      height: item.heightMm,
      reason: mapUnplacedReason(item.reason, sourcePart),
    };
  });
  const allUnplaced = upfrontUnplaced.concat(unplaced);

  const totalBoardCost = round(boards.reduce((total, board) => total + board.costoPlaca, 0), 2);
  const totalCantoMetros = round(
    boards.reduce(
      (total, board) =>
        total + board.placements.reduce((placementsTotal, placement) => placementsTotal + placement.cantoMetros, 0),
      0,
    ),
    4,
  );
  const desperdicioPct = round(
    Math.min(100, Math.max(0, nestingResult.desperdicioPct + params.desperdicioExtraPct)),
    4,
  );

  return {
    iteration,
    params,
    boards,
    summary: {
      boardsUsed: boards.length,
      totalAreaUtilMm2: round(boards.reduce((total, board) => total + board.areaUtilMm2, 0), 3),
      totalAreaUsadaMm2: round(boards.reduce((total, board) => total + board.areaUsadaMm2, 0), 3),
      totalAreaDesperdicioMm2: round(boards.reduce((total, board) => total + board.areaDesperdicioMm2, 0), 3),
      aprovechamientoPct: nestingResult.aprovechamientoPct,
      desperdicioPct,
      costoPlacas: totalBoardCost,
      totalCantoMetros,
      piezasTotales: input.parts.reduce((total, part) => total + Math.max(0, Math.floor(part.cantidad || 0)), 0),
      piezasUbicadas: boards.reduce((total, board) => total + board.placements.length, 0),
      piezasSinUbicar: allUnplaced.length,
    },
    unplaced: allUnplaced,
  };
}
