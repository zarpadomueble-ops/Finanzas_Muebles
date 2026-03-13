import { safeDiv } from "@/lib/utils";
import type { CuttingMaterialContext, CuttingOptimizationResult } from "./types";

const PALETTE = [
  "#0f766e",
  "#0369a1",
  "#1d4ed8",
  "#2563eb",
  "#4338ca",
  "#7c3aed",
  "#9333ea",
  "#b45309",
  "#b91c1c",
  "#be123c",
];

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function getPieceColor(index: number) {
  return PALETTE[index % PALETTE.length];
}

export interface BuildCuttingLayoutSvgOptions {
  width?: number;
  boardGap?: number;
  showOffcuts?: boolean;
  showCutLines?: boolean;
}

export function buildCuttingLayoutSvg(
  result: CuttingOptimizationResult,
  materials: Map<string, CuttingMaterialContext> = new Map(),
  options: BuildCuttingLayoutSvgOptions = {},
) {
  if (result.boards.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="180"><rect width="100%" height="100%" fill="#ffffff"/><text x="30" y="80" fill="#334155" font-size="14">Sin layout para renderizar.</text></svg>`;
  }

  const targetBoardWidth = options.width ?? 860;
  const boardGap = options.boardGap ?? 44;
  const maxBoardWidth = Math.max(...result.boards.map((board) => board.largoPlacaMm), 1);
  const scale = targetBoardWidth / maxBoardWidth;
  const canvasWidth = targetBoardWidth + 120;

  let yOffset = 24;
  const boardMarkup = result.boards
    .map((board) => {
      const material = materials.get(board.materialId);
      const boardWidthPx = board.largoPlacaMm * scale;
      const boardHeightPx = board.anchoPlacaMm * scale;
      const boardX = 36;
      const boardY = yOffset;

      const offcutsMarkup = options.showOffcuts === false
        ? ""
        : board.offcuts
            .map((offcut) => {
              const x = boardX + offcut.x * scale;
              const y = boardY + offcut.y * scale;
              const width = offcut.width * scale;
              const height = offcut.height * scale;

              return `
              <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#f1f5f9" stroke="#cbd5e1" stroke-dasharray="3 3" />
            `;
            })
            .join("\n");

      const placementsMarkup = board.placements
        .map((placement, index) => {
          const x = boardX + placement.x * scale;
          const y = boardY + placement.y * scale;
          const width = placement.width * scale;
          const height = placement.height * scale;
          const color = getPieceColor(index);
          const displayName = escapeXml(placement.sourcePartName);
          const dims = `${Math.round(placement.width)}x${Math.round(placement.height)}${placement.orientation === "rotated" ? " R" : ""}`;

          const grainLine =
            placement.grainDirection === "vertical"
              ? `<line x1="${x + width - 7}" y1="${y + 7}" x2="${x + width - 7}" y2="${y + height - 7}" stroke="#0f172a" stroke-width="1" marker-end="url(#grainArrow)" />`
              : `<line x1="${x + 7}" y1="${y + height - 7}" x2="${x + width - 7}" y2="${y + height - 7}" stroke="#0f172a" stroke-width="1" marker-end="url(#grainArrow)" />`;

          const cutLines = options.showCutLines === false
            ? ""
            : `
              <line x1="${x + width}" y1="${y}" x2="${x + width}" y2="${y + height}" stroke="#475569" stroke-width="0.8" stroke-dasharray="2 2" />
              <line x1="${x}" y1="${y + height}" x2="${x + width}" y2="${y + height}" stroke="#475569" stroke-width="0.8" stroke-dasharray="2 2" />
            `;

          return `
            <g>
              <rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${color}" fill-opacity="0.20" stroke="${color}" stroke-width="1.4" rx="1.5" />
              <text x="${x + 3}" y="${y + 12}" font-size="10.5" fill="#0f172a">${displayName}</text>
              <text x="${x + 3}" y="${y + 23}" font-size="9" fill="#334155">${escapeXml(dims)}</text>
              ${grainLine}
              ${cutLines}
            </g>
          `;
        })
        .join("\n");

      const boardUsePct = Math.round(safeDiv(board.areaUsadaMm2, board.areaUtilMm2) * 100);
      const materialLabel = material ? `${material.codigo || "MAT"} - ${material.nombre}` : board.materialId;
      const boardTitle = `${board.boardLabel} | ${Math.round(board.largoPlacaMm)}x${Math.round(board.anchoPlacaMm)}mm | ${materialLabel} | uso ${boardUsePct}%`;

      const markup = `
        <g>
          <rect x="${boardX}" y="${boardY}" width="${boardWidthPx}" height="${boardHeightPx}" fill="#ffffff" stroke="#0f172a" stroke-width="2.2" />
          <text x="${boardX}" y="${boardY - 10}" font-size="12.5" fill="#0f172a">${escapeXml(boardTitle)}</text>
          ${offcutsMarkup}
          ${placementsMarkup}
        </g>
      `;

      yOffset += boardHeightPx + boardGap;
      return markup;
    })
    .join("\n");

  const footerY = yOffset + 12;
  const totalHeight = Math.max(220, footerY + 24);

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${totalHeight}" viewBox="0 0 ${canvasWidth} ${totalHeight}">
      <defs>
        <marker id="grainArrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L0,6 L7,3 z" fill="#0f172a" />
        </marker>
      </defs>
      <rect width="100%" height="100%" fill="#f8fafc" />
      ${boardMarkup}
      <text x="36" y="${footerY}" font-size="11" fill="#475569">
        Placas: ${result.summary.boardsUsed} | Aprovechamiento: ${result.summary.aprovechamientoPct.toFixed(2)}% | Desperdicio: ${result.summary.desperdicioPct.toFixed(2)}% | Canto: ${result.summary.totalCantoMetros.toFixed(2)} m
      </text>
    </svg>
  `;
}

