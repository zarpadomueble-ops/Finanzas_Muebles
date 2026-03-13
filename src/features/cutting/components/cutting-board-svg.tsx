"use client";

import type { CuttingBoardLayout } from "@/domain/cutting";
import type { CuttingMaterialOption } from "@/features/cutting/types";
import { cn } from "@/lib/utils";
import {
  buildBoardTitle,
  canRenderPlacementLabel,
  getBoardScale,
  getPlacementLabel,
  getPlacementPalette,
} from "./cutting-render";

interface CuttingBoardSvgProps {
  board: CuttingBoardLayout;
  material?: CuttingMaterialOption;
  zoomPct?: number;
  compact?: boolean;
  className?: string;
}

export function CuttingBoardSvg({
  board,
  material,
  zoomPct = 100,
  compact = false,
  className,
}: CuttingBoardSvgProps) {
  const targetWidth = compact ? 320 : 920;
  const scale = getBoardScale(board, targetWidth, compact ? 100 : zoomPct);
  const boardWidth = board.largoPlacaMm * scale;
  const boardHeight = board.anchoPlacaMm * scale;
  const paddingX = 18;
  const paddingY = compact ? 18 : 26;
  const markerId = `grain-${board.boardKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  const canvasWidth = boardWidth + paddingX * 2;
  const canvasHeight = boardHeight + paddingY * 2 + (compact ? 0 : 18);

  return (
    <div className={cn("overflow-auto rounded-xl border border-slate-200 bg-white/90 p-2", className)}>
      {compact ? null : (
        <div className="mb-2 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">{board.boardLabel}</p>
            <p className="text-xs text-slate-500">{buildBoardTitle(board, material)}</p>
          </div>
          <div className="text-right text-xs text-slate-500">
            <p>{board.placements.length} piezas</p>
            <p>{board.aprovechamientoPct.toFixed(2)}% uso</p>
          </div>
        </div>
      )}

      <svg
        width={canvasWidth}
        height={canvasHeight}
        viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
        role="img"
        aria-label={buildBoardTitle(board, material)}
        className="max-w-none"
      >
        <defs>
          <marker
            id={markerId}
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="3"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L0,6 L7,3 z" fill="#0f172a" />
          </marker>
        </defs>

        <rect width="100%" height="100%" fill={compact ? "#ffffff" : "#f8fafc"} />
        <rect
          x={paddingX}
          y={paddingY}
          width={boardWidth}
          height={boardHeight}
          rx="6"
          fill="#ffffff"
          stroke="#0f172a"
          strokeWidth="2"
        />

        {board.offcuts.map((offcut, index) => (
          <rect
            key={`${board.boardKey}-offcut-${index}`}
            x={paddingX + offcut.x * scale}
            y={paddingY + offcut.y * scale}
            width={offcut.width * scale}
            height={offcut.height * scale}
            fill="#f1f5f9"
            stroke="#cbd5e1"
            strokeDasharray="4 3"
          />
        ))}

        {board.placements.map((placement, index) => {
          const palette = getPlacementPalette(index);
          const x = paddingX + placement.x * scale;
          const y = paddingY + placement.y * scale;
          const width = placement.width * scale;
          const height = placement.height * scale;
          const showLabels = !compact && canRenderPlacementLabel(placement, scale);

          return (
            <g key={placement.placementId}>
              <rect
                x={x}
                y={y}
                width={width}
                height={height}
                rx="3"
                fill={palette.fill}
                stroke={palette.stroke}
                strokeWidth={placement.blocked ? 2.1 : 1.4}
              />

              {placement.grainDirection === "vertical" ? (
                <line
                  x1={x + width - 8}
                  y1={y + 8}
                  x2={x + width - 8}
                  y2={y + height - 8}
                  stroke="#0f172a"
                  strokeWidth="1"
                  markerEnd={`url(#${markerId})`}
                />
              ) : null}

              {placement.grainDirection === "horizontal" && placement.cantoRequerido ? (
                <line
                  x1={x + 8}
                  y1={y + height - 8}
                  x2={x + width - 8}
                  y2={y + height - 8}
                  stroke="#0f172a"
                  strokeWidth="1"
                  markerEnd={`url(#${markerId})`}
                />
              ) : null}

              {showLabels ? (
                <>
                  <text x={x + 5} y={y + 13} fontSize="10.5" fill="#0f172a">
                    {placement.sourcePartName}
                  </text>
                  <text x={x + 5} y={y + 25} fontSize="9" fill="#334155">
                    {getPlacementLabel(placement)}
                  </text>
                </>
              ) : null}

              {placement.blocked && !compact ? (
                <circle cx={x + width - 8} cy={y + 8} r="3.5" fill={palette.accent} />
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

