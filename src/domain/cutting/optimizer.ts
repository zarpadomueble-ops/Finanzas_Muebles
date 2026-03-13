import { createId, round, safeDiv } from "@/lib/utils";
import {
  CutBoardLayout,
  CutJob,
  CutLayout,
  CutPart,
  Material,
} from "@/lib/types";

interface ExpandedPart {
  instanceId: string;
  sourcePartId: string;
  pieza: string;
  width: number;
  height: number;
  materialId: string;
  espesor: number;
  canRotate: boolean;
  grainRequired: boolean;
}

interface FreeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface WorkingBoard {
  boardIndex: number;
  width: number;
  height: number;
  materialId: string;
  espesor: number;
  freeRects: FreeRect[];
  placements: CutBoardLayout["placements"];
  usedArea: number;
}

export interface OptimizeInput {
  job: CutJob;
  parts: CutPart[];
  materials: Material[];
  iteration?: number;
}

function splitFreeRect(freeRect: FreeRect, used: { x: number; y: number; width: number; height: number }) {
  const right: FreeRect = {
    x: used.x + used.width,
    y: used.y,
    width: freeRect.width - used.width,
    height: used.height,
  };

  const bottom: FreeRect = {
    x: freeRect.x,
    y: used.y + used.height,
    width: freeRect.width,
    height: freeRect.height - used.height,
  };

  return [right, bottom].filter((rect) => rect.width > 0 && rect.height > 0);
}

function getSortedParts(parts: ExpandedPart[], iteration: number) {
  const sorted = [...parts];

  sorted.sort((a, b) => {
    const aArea = a.width * a.height;
    const bArea = b.width * b.height;

    if (iteration % 2 === 0) {
      return bArea - aArea;
    }

    const aLong = Math.max(a.width, a.height);
    const bLong = Math.max(b.width, b.height);
    return bLong - aLong;
  });

  return sorted;
}

function canRotate(part: ExpandedPart) {
  return part.canRotate && !part.grainRequired;
}

function getMaterialBoardCost(material: Material, boardWidth: number, boardHeight: number) {
  const areaM2 = (boardWidth * boardHeight) / 1_000_000;
  if (material.unidad === "m2") {
    return areaM2 * material.costoUnitario;
  }

  if (material.unidad === "unidad") {
    return material.costoUnitario;
  }

  return areaM2 * material.costoUnitario;
}

export function optimizeCut(input: OptimizeInput): CutLayout {
  const { job, parts, materials, iteration = 1 } = input;

  const usableWidth = job.largoPlaca - job.margenPerimetral * 2;
  const usableHeight = job.anchoPlaca - job.margenPerimetral * 2;

  const expanded: ExpandedPart[] = parts
    .flatMap((part) =>
      Array.from({ length: Math.max(1, part.cantidad) }, (_, index) => ({
        instanceId: `${part.id}-${index + 1}`,
        sourcePartId: part.id,
        pieza: part.pieza,
        width: part.largo,
        height: part.ancho,
        materialId: part.materialId,
        espesor: part.espesor,
        canRotate: part.rotacionPermitida,
        grainRequired: part.vetaObligatoria,
      })),
    )
    .filter((item) => item.width > 0 && item.height > 0);

  const byMaterial = new Map<string, ExpandedPart[]>();
  for (const item of expanded) {
    const key = `${item.materialId}-${item.espesor}`;
    const list = byMaterial.get(key) ?? [];
    list.push(item);
    byMaterial.set(key, list);
  }

  const boardLayouts: CutBoardLayout[] = [];

  for (const [key, groupParts] of byMaterial.entries()) {
    const [materialId, espesorText] = key.split("-");
    const espesor = Number(espesorText);
    const ordered = getSortedParts(groupParts, iteration);
    const boards: WorkingBoard[] = [];

    for (const part of ordered) {
      let placed = false;

      for (const board of boards) {
        let bestChoice:
          | {
              freeRectIndex: number;
              x: number;
              y: number;
              width: number;
              height: number;
              rotated: boolean;
              score: number;
            }
          | undefined;

        board.freeRects.forEach((freeRect, rectIndex) => {
          const orientations = [
            { width: part.width + job.kerf, height: part.height + job.kerf, rotated: false },
            canRotate(part)
              ? { width: part.height + job.kerf, height: part.width + job.kerf, rotated: true }
              : undefined,
          ].filter(Boolean) as Array<{ width: number; height: number; rotated: boolean }>;

          for (const orientation of orientations) {
            if (orientation.width <= freeRect.width && orientation.height <= freeRect.height) {
              const score = freeRect.width * freeRect.height - orientation.width * orientation.height;
              if (!bestChoice || score < bestChoice.score) {
                bestChoice = {
                  freeRectIndex: rectIndex,
                  x: freeRect.x,
                  y: freeRect.y,
                  width: orientation.width,
                  height: orientation.height,
                  rotated: orientation.rotated,
                  score,
                };
              }
            }
          }
        });

        if (bestChoice) {
          const freeRect = board.freeRects[bestChoice.freeRectIndex];
          const usedRect = {
            x: bestChoice.x,
            y: bestChoice.y,
            width: bestChoice.width,
            height: bestChoice.height,
          };

          board.placements.push({
            partId: part.sourcePartId,
            pieza: part.pieza,
            x: bestChoice.x + job.margenPerimetral,
            y: bestChoice.y + job.margenPerimetral,
            width: bestChoice.width - job.kerf,
            height: bestChoice.height - job.kerf,
            rotated: bestChoice.rotated,
            grainArrow: part.grainRequired ? "vertical" : "horizontal",
          });

          board.usedArea += (bestChoice.width - job.kerf) * (bestChoice.height - job.kerf);
          board.freeRects.splice(bestChoice.freeRectIndex, 1, ...splitFreeRect(freeRect, usedRect));
          placed = true;
          break;
        }
      }

      if (!placed) {
        const board: WorkingBoard = {
          boardIndex: boards.length + 1,
          width: job.largoPlaca,
          height: job.anchoPlaca,
          materialId,
          espesor,
          freeRects: [{ x: 0, y: 0, width: usableWidth, height: usableHeight }],
          placements: [],
          usedArea: 0,
        };

        boards.push(board);

        const fitNormal = part.width + job.kerf <= usableWidth && part.height + job.kerf <= usableHeight;
        const fitRotated =
          canRotate(part) && part.height + job.kerf <= usableWidth && part.width + job.kerf <= usableHeight;

        if (!fitNormal && !fitRotated) {
          continue;
        }

        const rotated = !fitNormal && fitRotated;
        const placementWidth = (rotated ? part.height : part.width) + job.kerf;
        const placementHeight = (rotated ? part.width : part.height) + job.kerf;

        board.placements.push({
          partId: part.sourcePartId,
          pieza: part.pieza,
          x: job.margenPerimetral,
          y: job.margenPerimetral,
          width: placementWidth - job.kerf,
          height: placementHeight - job.kerf,
          rotated,
          grainArrow: part.grainRequired ? "vertical" : "horizontal",
        });

        board.usedArea += (placementWidth - job.kerf) * (placementHeight - job.kerf);
        board.freeRects = splitFreeRect(board.freeRects[0], {
          x: 0,
          y: 0,
          width: placementWidth,
          height: placementHeight,
        });
      }
    }

    boards.forEach((board) => {
      const boardArea = usableWidth * usableHeight;
      boardLayouts.push({
        boardIndex: boardLayouts.length + 1,
        width: board.width,
        height: board.height,
        materialId: board.materialId,
        espesor: board.espesor,
        placements: board.placements,
        usedArea: round(board.usedArea),
        wasteArea: round(Math.max(boardArea - board.usedArea, 0)),
      });
    });
  }

  const totalUsed = boardLayouts.reduce((acc, board) => acc + board.usedArea, 0);
  const totalAvailable = boardLayouts.reduce(
    (acc, board) => acc + (board.width - job.margenPerimetral * 2) * (board.height - job.margenPerimetral * 2),
    0,
  );

  const materialLookup = new Map(materials.map((material) => [material.id, material]));
  const totalBoardCost = round(
    boardLayouts.reduce((acc, board) => {
      const material = materialLookup.get(board.materialId);
      if (!material) {
        return acc;
      }

      return acc + getMaterialBoardCost(material, board.width, board.height);
    }, 0),
  );

  const utilized = safeDiv(totalUsed, totalAvailable) * 100;
  const waste = 100 - utilized + job.desperdicioExtra;

  return {
    id: createId(),
    cutJobId: job.id,
    iteration,
    utilizedPct: round(utilized),
    wastePct: round(waste),
    boardsNeeded: boardLayouts.length,
    totalBoardCost,
    layouts: boardLayouts,
    createdAt: new Date().toISOString(),
  };
}

function getColorByIndex(index: number) {
  const palette = ["#2563eb", "#059669", "#ea580c", "#7c3aed", "#dc2626", "#0e7490", "#9333ea"];
  return palette[index % palette.length];
}

export function buildLayoutSvg(layout: CutLayout) {
  const boardGap = 40;
  const maxBoardWidth = Math.max(...layout.layouts.map((board) => board.width), 1);
  const targetBoardWidth = 600;
  const scale = targetBoardWidth / maxBoardWidth;

  const totalHeight =
    layout.layouts.reduce((acc, board) => acc + board.height * scale + boardGap, 0) +
    boardGap +
    (layout.layouts.length - 1) * 10;

  let yOffset = boardGap;
  const boardSvgs = layout.layouts
    .map((board) => {
      const bw = board.width * scale;
      const bh = board.height * scale;

      const pieces = board.placements
        .map((piece, index) => {
          const x = 30 + piece.x * scale;
          const y = yOffset + piece.y * scale;
          const w = piece.width * scale;
          const h = piece.height * scale;
          const color = getColorByIndex(index);
          const textY = y + Math.min(18, h / 2);
          const grainLine =
            piece.grainArrow === "vertical"
              ? `<line x1="${x + w - 8}" y1="${y + 8}" x2="${x + w - 8}" y2="${y + h - 8}" stroke="#111827" stroke-width="1" marker-end="url(#arrow)" />`
              : `<line x1="${x + 8}" y1="${y + h - 8}" x2="${x + w - 8}" y2="${y + h - 8}" stroke="#111827" stroke-width="1" marker-end="url(#arrow)" />`;

          return `
            <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="1.5" />
            <text x="${x + 4}" y="${textY}" font-size="10" fill="#0f172a">${piece.pieza}</text>
            <text x="${x + 4}" y="${textY + 12}" font-size="9" fill="#334155">${Math.round(piece.width)}x${Math.round(piece.height)}${piece.rotated ? " (R)" : ""}</text>
            ${grainLine}
          `;
        })
        .join("\n");

      const boardSvg = `
        <g>
          <rect x="30" y="${yOffset}" width="${bw}" height="${bh}" fill="#f8fafc" stroke="#1e293b" stroke-width="2" />
          <text x="34" y="${yOffset - 10}" font-size="12" fill="#1e293b">Placa ${board.boardIndex} | ${board.width}x${board.height}mm | Uso ${Math.round(
            safeDiv(board.usedArea, board.usedArea + board.wasteArea) * 100,
          )}%</text>
          ${pieces}
        </g>
      `;

      yOffset += bh + boardGap;
      return boardSvg;
    })
    .join("\n");

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="${Math.max(320, totalHeight)}" viewBox="0 0 720 ${Math.max(320, totalHeight)}">
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L7,3 z" fill="#111827" />
        </marker>
      </defs>
      <rect width="100%" height="100%" fill="#ffffff" />
      ${boardSvgs}
    </svg>
  `;
}


