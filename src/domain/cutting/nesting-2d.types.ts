export type NestingOrientation = "normal" | "rotated";

export type NestingGrainDirection = "horizontal" | "vertical";

export interface NestingPieceInput {
  id: string;
  nombre: string;
  widthMm: number;
  heightMm: number;
  quantity: number;
  rotatable: boolean;
  grainDirectionRequired: boolean;
  materialGroup: string;
}

export interface NestingBoardInput {
  widthMm: number;
  heightMm: number;
}

export interface NestingParamsInput {
  kerfMm: number;
  marginMm: number;
}

export interface NestingExpandedPiece {
  instanceId: string;
  pieceId: string;
  nombre: string;
  instanceIndex: number;
  widthMm: number;
  heightMm: number;
  rotatable: boolean;
  grainDirectionRequired: boolean;
  materialGroup: string;
}

export interface NestingFreeRect {
  x: number;
  y: number;
  widthMm: number;
  heightMm: number;
  areaMm2: number;
}

export interface NestingPlacement {
  instanceId: string;
  pieceId: string;
  nombre: string;
  instanceIndex: number;
  materialGroup: string;
  x: number;
  y: number;
  widthMm: number;
  heightMm: number;
  rotated: boolean;
  orientation: NestingOrientation;
  grainDirection: NestingGrainDirection;
  areaMm2: number;
}

export interface NestingUnplacedPiece {
  instanceId: string;
  pieceId: string;
  nombre: string;
  instanceIndex: number;
  materialGroup: string;
  widthMm: number;
  heightMm: number;
  reason: "invalid_piece" | "too_large_for_board" | "no_space_available";
}

export interface NestingBoardLayout {
  boardIndex: number;
  materialGroup: string;
  widthMm: number;
  heightMm: number;
  usableWidthMm: number;
  usableHeightMm: number;
  placements: NestingPlacement[];
  freeRects: NestingFreeRect[];
  areaUsadaMm2: number;
  areaTotalMm2: number;
  aprovechamientoPct: number;
  desperdicioPct: number;
}

export interface NestingGroupLayout {
  materialGroup: string;
  boards: NestingBoardLayout[];
  unplaced: NestingUnplacedPiece[];
  areaUsadaMm2: number;
  areaTotalMm2: number;
  aprovechamientoPct: number;
  desperdicioPct: number;
}

export interface Nesting2DInput {
  pieces: NestingPieceInput[];
  board: NestingBoardInput;
  params: NestingParamsInput;
}

export interface Nesting2DResult {
  board: NestingBoardInput;
  params: NestingParamsInput;
  groups: NestingGroupLayout[];
  boards: NestingBoardLayout[];
  unplaced: NestingUnplacedPiece[];
  areaUsadaMm2: number;
  areaTotalMm2: number;
  aprovechamientoPct: number;
  desperdicioPct: number;
}

