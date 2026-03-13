export type CuttingOrientation = "normal" | "rotated";

export type CuttingGrainDirection = "horizontal" | "vertical";

export interface CuttingPartInput {
  id: string;
  nombrePieza: string;
  cantidad: number;
  largoMm: number;
  anchoMm: number;
  materialId: string;
  espesorMm: number | null;
  rotacionPermitida: boolean;
  vetaObligatoria: boolean;
  cantoRequerido: string;
  prioridad: number;
  observacion: string;
  bloqueada: boolean;
}

export interface CuttingJobParamsInput {
  largoPlacaMm: number;
  anchoPlacaMm: number;
  kerfMm: number;
  margenPerimetralMm: number;
  desperdicioExtraPct: number;
  permitirRotacionDefault: boolean;
  vetaDefault: boolean;
}

export interface CuttingMaterialContext {
  id: string;
  codigo: string | null;
  nombre: string;
  unidad: string;
  costoUnitario: number;
  areaM2: number | null;
  largoMm: number | null;
  anchoMm: number | null;
  espesorMm: number | null;
}

export interface CuttingPlacement {
  placementId: string;
  sourcePartId: string;
  sourcePartName: string;
  sourceInstance: number;
  materialId: string;
  espesorMm: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  orientation: CuttingOrientation;
  grainDirection: CuttingGrainDirection;
  priority: number;
  blocked: boolean;
  cantoRequerido: string;
  cantoMetros: number;
  observacion: string;
}

export interface CuttingOffcutRect {
  x: number;
  y: number;
  width: number;
  height: number;
  areaMm2: number;
}

export interface CuttingBoardLayout {
  boardKey: string;
  boardIndex: number;
  boardLabel: string;
  materialId: string;
  espesorMm: number | null;
  largoPlacaMm: number;
  anchoPlacaMm: number;
  areaUtilMm2: number;
  areaUsadaMm2: number;
  areaDesperdicioMm2: number;
  aprovechamientoPct: number;
  costoPlaca: number;
  placements: CuttingPlacement[];
  offcuts: CuttingOffcutRect[];
}

export interface CuttingUnplacedPart {
  sourcePartId: string;
  sourcePartName: string;
  sourceInstance: number;
  materialId: string;
  espesorMm: number | null;
  width: number;
  height: number;
  reason: "invalid_part" | "invalid_material" | "too_large_for_board" | "no_space_available";
}

export interface CuttingOptimizationSummary {
  boardsUsed: number;
  totalAreaUtilMm2: number;
  totalAreaUsadaMm2: number;
  totalAreaDesperdicioMm2: number;
  aprovechamientoPct: number;
  desperdicioPct: number;
  costoPlacas: number;
  totalCantoMetros: number;
  piezasTotales: number;
  piezasUbicadas: number;
  piezasSinUbicar: number;
}

export interface CuttingOptimizationResult {
  iteration: number;
  params: CuttingJobParamsInput;
  boards: CuttingBoardLayout[];
  unplaced: CuttingUnplacedPart[];
  summary: CuttingOptimizationSummary;
}

