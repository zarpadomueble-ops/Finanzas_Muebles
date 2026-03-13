import { round, safeDiv } from "@/lib/utils";
import {
  applyBoardMargin,
  buildInitialFreeRect,
  canPieceFitBoard,
  chooseBestOrientationForRect,
  expandPiecesByQuantity,
  groupPiecesByMaterial,
  normalizeNestingInput,
  pruneFreeRects,
  sortPiecesForFirstFitDecreasing,
  splitFreeRectGuillotine,
  summarizeBoardMetrics,
} from "./nesting-2d.helpers";
import type {
  Nesting2DInput,
  Nesting2DResult,
  NestingBoardLayout,
  NestingExpandedPiece,
  NestingFreeRect,
  NestingGroupLayout,
  NestingPlacement,
  NestingUnplacedPiece,
} from "./nesting-2d.types";

interface WorkingBoard {
  boardIndex: number;
  materialGroup: string;
  placements: NestingPlacement[];
  freeRects: NestingFreeRect[];
}

function createWorkingBoard(boardIndex: number, materialGroup: string, initialRect: NestingFreeRect): WorkingBoard {
  return {
    boardIndex,
    materialGroup,
    placements: [],
    freeRects: [initialRect],
  };
}

function createPlacement(
  piece: NestingExpandedPiece,
  params: Nesting2DInput["params"],
  freeRect: NestingFreeRect,
  widthMm: number,
  heightMm: number,
  rotated: boolean,
): NestingPlacement {
  return {
    instanceId: piece.instanceId,
    pieceId: piece.pieceId,
    nombre: piece.nombre,
    instanceIndex: piece.instanceIndex,
    materialGroup: piece.materialGroup,
    x: round(freeRect.x + params.marginMm, 3),
    y: round(freeRect.y + params.marginMm, 3),
    widthMm: round(widthMm, 3),
    heightMm: round(heightMm, 3),
    rotated,
    orientation: rotated ? "rotated" : "normal",
    grainDirection: piece.grainDirectionRequired ? (rotated ? "horizontal" : "vertical") : "horizontal",
    areaMm2: round(widthMm * heightMm, 3),
  };
}

function tryPlacePieceOnBoard(
  board: WorkingBoard,
  piece: NestingExpandedPiece,
  input: Nesting2DInput,
) {
  for (let freeRectIndex = 0; freeRectIndex < board.freeRects.length; freeRectIndex += 1) {
    const freeRect = board.freeRects[freeRectIndex];
    const orientation = chooseBestOrientationForRect(piece, freeRect);

    if (!orientation) {
      continue;
    }

    const placement = createPlacement(
      piece,
      input.params,
      freeRect,
      orientation.widthMm,
      orientation.heightMm,
      orientation.rotated,
    );

    const nextRects = splitFreeRectGuillotine(
      freeRect,
      { widthMm: orientation.widthMm, heightMm: orientation.heightMm },
      input.params,
    );

    board.placements.push(placement);
    board.freeRects = pruneFreeRects(
      board.freeRects.filter((_, index) => index !== freeRectIndex).concat(nextRects),
    );

    return placement;
  }

  return null;
}

function buildBoardLayout(board: WorkingBoard, input: Nesting2DInput): NestingBoardLayout {
  const metrics = summarizeBoardMetrics(board.placements, input.board, input.params);

  return {
    boardIndex: board.boardIndex,
    materialGroup: board.materialGroup,
    widthMm: input.board.widthMm,
    heightMm: input.board.heightMm,
    usableWidthMm: metrics.usableWidthMm,
    usableHeightMm: metrics.usableHeightMm,
    placements: board.placements,
    freeRects: applyBoardMargin(board.freeRects, input.params),
    areaUsadaMm2: metrics.areaUsadaMm2,
    areaTotalMm2: metrics.areaTotalMm2,
    aprovechamientoPct: metrics.aprovechamientoPct,
    desperdicioPct: metrics.desperdicioPct,
  };
}

function buildGroupLayout(
  materialGroup: string,
  boards: WorkingBoard[],
  unplaced: NestingUnplacedPiece[],
  input: Nesting2DInput,
): NestingGroupLayout {
  const boardLayouts = boards.map((board) => buildBoardLayout(board, input));
  const areaUsadaMm2 = round(boardLayouts.reduce((total, board) => total + board.areaUsadaMm2, 0), 3);
  const areaTotalMm2 = round(boardLayouts.reduce((total, board) => total + board.areaTotalMm2, 0), 3);
  const aprovechamientoPct = areaTotalMm2 > 0 ? round(safeDiv(areaUsadaMm2, areaTotalMm2) * 100, 4) : 0;

  return {
    materialGroup,
    boards: boardLayouts,
    unplaced,
    areaUsadaMm2,
    areaTotalMm2,
    aprovechamientoPct,
    desperdicioPct: areaTotalMm2 > 0 ? round(100 - aprovechamientoPct, 4) : 0,
  };
}

function createUnplacedPiece(
  piece: NestingExpandedPiece,
  reason: NestingUnplacedPiece["reason"],
): NestingUnplacedPiece {
  return {
    instanceId: piece.instanceId,
    pieceId: piece.pieceId,
    nombre: piece.nombre,
    instanceIndex: piece.instanceIndex,
    materialGroup: piece.materialGroup,
    widthMm: piece.widthMm,
    heightMm: piece.heightMm,
    reason,
  };
}

export function nestRectangles2D(input: Nesting2DInput): Nesting2DResult {
  const normalizedInput = normalizeNestingInput(input);
  const { expanded, rejected } = expandPiecesByQuantity(normalizedInput.pieces);
  const grouped = groupPiecesByMaterial(expanded);
  const initialRect = buildInitialFreeRect(normalizedInput.board, normalizedInput.params);

  let nextBoardIndex = 1;
  const groups: NestingGroupLayout[] = [];

  for (const [materialGroup, groupPieces] of grouped.entries()) {
    const boards: WorkingBoard[] = [];
    const unplaced: NestingUnplacedPiece[] = [];
    const orderedPieces = sortPiecesForFirstFitDecreasing(groupPieces);

    for (const piece of orderedPieces) {
      if (!canPieceFitBoard(piece, normalizedInput.board, normalizedInput.params)) {
        unplaced.push(createUnplacedPiece(piece, "too_large_for_board"));
        continue;
      }

      let placed = false;

      for (const board of boards) {
        if (tryPlacePieceOnBoard(board, piece, normalizedInput)) {
          placed = true;
          break;
        }
      }

      if (placed) {
        continue;
      }

      const newBoard = createWorkingBoard(nextBoardIndex, materialGroup, initialRect);
      nextBoardIndex += 1;
      const placement = tryPlacePieceOnBoard(newBoard, piece, normalizedInput);

      if (!placement) {
        unplaced.push(createUnplacedPiece(piece, "no_space_available"));
        continue;
      }

      boards.push(newBoard);
    }

    groups.push(buildGroupLayout(materialGroup, boards, unplaced, normalizedInput));
  }

  const boards = groups.flatMap((group) => group.boards);
  const unplaced = rejected.concat(groups.flatMap((group) => group.unplaced));
  const areaUsadaMm2 = round(boards.reduce((total, board) => total + board.areaUsadaMm2, 0), 3);
  const areaTotalMm2 = round(boards.reduce((total, board) => total + board.areaTotalMm2, 0), 3);
  const aprovechamientoPct = areaTotalMm2 > 0 ? round(safeDiv(areaUsadaMm2, areaTotalMm2) * 100, 4) : 0;

  return {
    board: normalizedInput.board,
    params: normalizedInput.params,
    groups,
    boards,
    unplaced,
    areaUsadaMm2,
    areaTotalMm2,
    aprovechamientoPct,
    desperdicioPct: areaTotalMm2 > 0 ? round(100 - aprovechamientoPct, 4) : 0,
  };
}
