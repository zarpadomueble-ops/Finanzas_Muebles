import { clamp } from "@/lib/utils";
import type { CuttingBoardLayout, CuttingPlacement } from "@/domain/cutting";
import type { CuttingMaterialOption } from "@/features/cutting/types";

const PIECE_PALETTE = [
  { fill: "#dbeafe", stroke: "#2563eb", accent: "#1d4ed8" },
  { fill: "#dcfce7", stroke: "#16a34a", accent: "#15803d" },
  { fill: "#ffedd5", stroke: "#ea580c", accent: "#c2410c" },
  { fill: "#f3e8ff", stroke: "#7c3aed", accent: "#6d28d9" },
  { fill: "#fee2e2", stroke: "#dc2626", accent: "#b91c1c" },
  { fill: "#cffafe", stroke: "#0891b2", accent: "#0e7490" },
  { fill: "#fef3c7", stroke: "#d97706", accent: "#b45309" },
];

export function getPlacementPalette(index: number) {
  return PIECE_PALETTE[index % PIECE_PALETTE.length];
}

export function buildBoardTitle(
  board: CuttingBoardLayout,
  material: CuttingMaterialOption | undefined,
) {
  const materialLabel = material ? `${material.codigo} - ${material.nombre}` : board.materialId;
  return `${board.boardLabel} | ${Math.round(board.largoPlacaMm)}x${Math.round(board.anchoPlacaMm)} mm | ${materialLabel}`;
}

export function getBoardScale(board: CuttingBoardLayout, targetWidth: number, zoomPct: number) {
  const baseScale = targetWidth / Math.max(board.largoPlacaMm, 1);
  return baseScale * clamp(zoomPct, 40, 220) / 100;
}

export function canRenderPlacementLabel(placement: CuttingPlacement, scale: number) {
  return placement.width * scale >= 72 && placement.height * scale >= 34;
}

export function getPlacementLabel(placement: CuttingPlacement) {
  return `${Math.round(placement.width)} x ${Math.round(placement.height)}${placement.orientation === "rotated" ? " R" : ""}`;
}

export function getBoardUtilizationBarClass(aprovechamientoPct: number) {
  if (aprovechamientoPct >= 85) {
    return "bg-emerald-500";
  }

  if (aprovechamientoPct >= 65) {
    return "bg-amber-500";
  }

  return "bg-rose-500";
}

