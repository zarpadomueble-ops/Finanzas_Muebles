import { round, safeDiv } from "@/lib/utils";
import type {
  Nesting2DInput,
  NestingBoardInput,
  NestingExpandedPiece,
  NestingFreeRect,
  NestingOrientation,
  NestingParamsInput,
  NestingPieceInput,
  NestingPlacement,
  NestingUnplacedPiece,
} from "./nesting-2d.types";

const MIN_RECT_SIDE_MM = 1;

interface OrientationCandidate {
  widthMm: number;
  heightMm: number;
  rotated: boolean;
  orientation: NestingOrientation;
}

function normalizeNonNegative(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function normalizePositiveInteger(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

export function normalizeNestingInput(input: Nesting2DInput): Nesting2DInput {
  return {
    board: {
      widthMm: normalizeNonNegative(input.board.widthMm),
      heightMm: normalizeNonNegative(input.board.heightMm),
    },
    params: {
      kerfMm: normalizeNonNegative(input.params.kerfMm),
      marginMm: normalizeNonNegative(input.params.marginMm),
    },
    pieces: input.pieces.map((piece) => ({
      ...piece,
      widthMm: normalizeNonNegative(piece.widthMm),
      heightMm: normalizeNonNegative(piece.heightMm),
      quantity: normalizePositiveInteger(piece.quantity),
    })),
  };
}

export function getUsableBoardSize(board: NestingBoardInput, params: NestingParamsInput) {
  return {
    usableWidthMm: Math.max(0, board.widthMm - params.marginMm * 2),
    usableHeightMm: Math.max(0, board.heightMm - params.marginMm * 2),
  };
}

export function expandPiecesByQuantity(pieces: NestingPieceInput[]) {
  const expanded: NestingExpandedPiece[] = [];
  const rejected: NestingUnplacedPiece[] = [];

  for (const piece of pieces) {
    if (!piece.materialGroup.trim()) {
      const quantity = Math.max(1, normalizePositiveInteger(piece.quantity));
      for (let instanceIndex = 1; instanceIndex <= quantity; instanceIndex += 1) {
        rejected.push({
          instanceId: `${piece.id}:${instanceIndex}`,
          pieceId: piece.id,
          nombre: piece.nombre,
          instanceIndex,
          materialGroup: "",
          widthMm: normalizeNonNegative(piece.widthMm),
          heightMm: normalizeNonNegative(piece.heightMm),
          reason: "invalid_piece",
        });
      }
      continue;
    }

    if (piece.widthMm <= 0 || piece.heightMm <= 0 || piece.quantity <= 0) {
      const quantity = Math.max(1, normalizePositiveInteger(piece.quantity));
      for (let instanceIndex = 1; instanceIndex <= quantity; instanceIndex += 1) {
        rejected.push({
          instanceId: `${piece.id}:${instanceIndex}`,
          pieceId: piece.id,
          nombre: piece.nombre,
          instanceIndex,
          materialGroup: piece.materialGroup,
          widthMm: normalizeNonNegative(piece.widthMm),
          heightMm: normalizeNonNegative(piece.heightMm),
          reason: "invalid_piece",
        });
      }
      continue;
    }

    for (let instanceIndex = 1; instanceIndex <= piece.quantity; instanceIndex += 1) {
      expanded.push({
        instanceId: `${piece.id}:${instanceIndex}`,
        pieceId: piece.id,
        nombre: piece.nombre,
        instanceIndex,
        widthMm: piece.widthMm,
        heightMm: piece.heightMm,
        rotatable: Boolean(piece.rotatable),
        grainDirectionRequired: Boolean(piece.grainDirectionRequired),
        materialGroup: piece.materialGroup.trim(),
      });
    }
  }

  return { expanded, rejected };
}

export function sortPiecesForFirstFitDecreasing(pieces: NestingExpandedPiece[]) {
  return [...pieces].sort((a, b) => {
    const areaDiff = b.widthMm * b.heightMm - a.widthMm * a.heightMm;
    if (Math.abs(areaDiff) > 0.0001) {
      return areaDiff;
    }

    const longSideDiff = Math.max(b.widthMm, b.heightMm) - Math.max(a.widthMm, a.heightMm);
    if (Math.abs(longSideDiff) > 0.0001) {
      return longSideDiff;
    }

    return a.nombre.localeCompare(b.nombre);
  });
}

export function groupPiecesByMaterial(pieces: NestingExpandedPiece[]) {
  const groups = new Map<string, NestingExpandedPiece[]>();

  for (const piece of pieces) {
    const current = groups.get(piece.materialGroup) ?? [];
    current.push(piece);
    groups.set(piece.materialGroup, current);
  }

  return groups;
}

export function buildInitialFreeRect(board: NestingBoardInput, params: NestingParamsInput): NestingFreeRect {
  const { usableWidthMm, usableHeightMm } = getUsableBoardSize(board, params);
  return {
    x: 0,
    y: 0,
    widthMm: usableWidthMm,
    heightMm: usableHeightMm,
    areaMm2: round(usableWidthMm * usableHeightMm, 3),
  };
}

export function buildOrientationCandidates(piece: NestingExpandedPiece) {
  const candidates: OrientationCandidate[] = [
    {
      widthMm: piece.widthMm,
      heightMm: piece.heightMm,
      rotated: false,
      orientation: "normal",
    },
  ];

  if (piece.rotatable && !piece.grainDirectionRequired && Math.abs(piece.widthMm - piece.heightMm) > 0.001) {
    candidates.push({
      widthMm: piece.heightMm,
      heightMm: piece.widthMm,
      rotated: true,
      orientation: "rotated",
    });
  }

  return candidates;
}

export function canPieceFitBoard(
  piece: NestingExpandedPiece,
  board: NestingBoardInput,
  params: NestingParamsInput,
) {
  const { usableWidthMm, usableHeightMm } = getUsableBoardSize(board, params);
  return buildOrientationCandidates(piece).some(
    (candidate) =>
      candidate.widthMm <= usableWidthMm + 0.0001 && candidate.heightMm <= usableHeightMm + 0.0001,
  );
}

function scoreOrientationCandidate(freeRect: NestingFreeRect, candidate: OrientationCandidate) {
  const remainingWidth = freeRect.widthMm - candidate.widthMm;
  const remainingHeight = freeRect.heightMm - candidate.heightMm;
  const leftoverArea = remainingWidth * freeRect.heightMm + remainingHeight * candidate.widthMm;
  const balancePenalty = Math.abs(remainingWidth - remainingHeight) * 0.1;
  return leftoverArea + balancePenalty;
}

export function chooseBestOrientationForRect(
  piece: NestingExpandedPiece,
  freeRect: NestingFreeRect,
) {
  const fitting = buildOrientationCandidates(piece).filter(
    (candidate) =>
      candidate.widthMm <= freeRect.widthMm + 0.0001 && candidate.heightMm <= freeRect.heightMm + 0.0001,
  );

  if (fitting.length === 0) {
    return null;
  }

  return fitting.sort((a, b) => scoreOrientationCandidate(freeRect, a) - scoreOrientationCandidate(freeRect, b))[0];
}

export function splitFreeRectGuillotine(
  freeRect: NestingFreeRect,
  placement: Pick<NestingPlacement, "widthMm" | "heightMm">,
  params: NestingParamsInput,
) {
  const kerfMm = normalizeNonNegative(params.kerfMm);
  const remainingWidth = freeRect.widthMm - placement.widthMm - kerfMm;
  const remainingHeight = freeRect.heightMm - placement.heightMm - kerfMm;

  const splitAlongWidth = remainingWidth > remainingHeight;
  const nextRects: NestingFreeRect[] = [];

  if (splitAlongWidth) {
    if (remainingWidth > MIN_RECT_SIDE_MM) {
      nextRects.push({
        x: freeRect.x + placement.widthMm + kerfMm,
        y: freeRect.y,
        widthMm: remainingWidth,
        heightMm: freeRect.heightMm,
        areaMm2: round(remainingWidth * freeRect.heightMm, 3),
      });
    }

    if (remainingHeight > MIN_RECT_SIDE_MM) {
      nextRects.push({
        x: freeRect.x,
        y: freeRect.y + placement.heightMm + kerfMm,
        widthMm: placement.widthMm,
        heightMm: remainingHeight,
        areaMm2: round(placement.widthMm * remainingHeight, 3),
      });
    }
  } else {
    if (remainingHeight > MIN_RECT_SIDE_MM) {
      nextRects.push({
        x: freeRect.x,
        y: freeRect.y + placement.heightMm + kerfMm,
        widthMm: freeRect.widthMm,
        heightMm: remainingHeight,
        areaMm2: round(freeRect.widthMm * remainingHeight, 3),
      });
    }

    if (remainingWidth > MIN_RECT_SIDE_MM) {
      nextRects.push({
        x: freeRect.x + placement.widthMm + kerfMm,
        y: freeRect.y,
        widthMm: remainingWidth,
        heightMm: placement.heightMm,
        areaMm2: round(remainingWidth * placement.heightMm, 3),
      });
    }
  }

  return nextRects.filter((rect) => rect.widthMm > MIN_RECT_SIDE_MM && rect.heightMm > MIN_RECT_SIDE_MM);
}

function isContainedRect(a: NestingFreeRect, b: NestingFreeRect) {
  return (
    a.x >= b.x - 0.0001 &&
    a.y >= b.y - 0.0001 &&
    a.x + a.widthMm <= b.x + b.widthMm + 0.0001 &&
    a.y + a.heightMm <= b.y + b.heightMm + 0.0001
  );
}

export function pruneFreeRects(rects: NestingFreeRect[]) {
  const filtered = rects.filter((rect) => rect.widthMm > MIN_RECT_SIDE_MM && rect.heightMm > MIN_RECT_SIDE_MM);
  const pruned: NestingFreeRect[] = [];

  for (const rect of filtered) {
    const contained = filtered.some((other) => rect !== other && isContainedRect(rect, other));
    if (!contained) {
      pruned.push({
        ...rect,
        areaMm2: round(rect.widthMm * rect.heightMm, 3),
      });
    }
  }

  return pruned.sort((a, b) => {
    if (Math.abs(a.y - b.y) > 0.0001) {
      return a.y - b.y;
    }

    if (Math.abs(a.x - b.x) > 0.0001) {
      return a.x - b.x;
    }

    return b.areaMm2 - a.areaMm2;
  });
}

export function applyBoardMargin(rects: NestingFreeRect[], params: NestingParamsInput) {
  return rects.map((rect) => ({
    ...rect,
    x: round(rect.x + params.marginMm, 3),
    y: round(rect.y + params.marginMm, 3),
    areaMm2: round(rect.widthMm * rect.heightMm, 3),
  }));
}

export function summarizeBoardMetrics(
  placements: NestingPlacement[],
  board: NestingBoardInput,
  params: NestingParamsInput,
) {
  const { usableWidthMm, usableHeightMm } = getUsableBoardSize(board, params);
  const areaUsadaMm2 = round(
    placements.reduce((total, placement) => total + placement.areaMm2, 0),
    3,
  );
  const areaTotalMm2 = round(usableWidthMm * usableHeightMm, 3);
  const aprovechamientoPct = round(safeDiv(areaUsadaMm2, areaTotalMm2) * 100, 4);
  const desperdicioPct = round(100 - aprovechamientoPct, 4);

  return {
    usableWidthMm,
    usableHeightMm,
    areaUsadaMm2,
    areaTotalMm2,
    aprovechamientoPct,
    desperdicioPct,
  };
}

