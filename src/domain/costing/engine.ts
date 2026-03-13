import { round, safeDiv } from "@/lib/utils";

export interface CostingGlobalSettingsInput {
  horasProductivasMes: number;
  costosFijosMes: number;
  costoHoraTaller: number;
  desperdicioMelaminaPct: number;
  margenMedidaPct: number;
  margenEcommercePct: number;
  impuestosPct: number;
  publicidadPct: number;
  comisionCobroPct: number;
  embalajePromedio: number;
  envioPromedio: number;
}

export interface MaterialCostLineInput {
  id?: string;
  materialId?: string | null;
  descripcion?: string;
  quantity: number;
  unitCost: number;
  wastePct?: number;
}

export interface MaterialCostLineResult {
  id?: string;
  materialId?: string | null;
  descripcion?: string;
  quantity: number;
  unitCost: number;
  lineWastePct: number;
  globalWastePct: number;
  baseSubtotal: number;
  wasteSubtotal: number;
  totalSubtotal: number;
}

export interface MaterialsSubtotalResult {
  lines: MaterialCostLineResult[];
  baseSubtotal: number;
  wasteSubtotal: number;
  subtotal: number;
}

export interface LaborCostLineInput {
  id?: string;
  processKey?: string;
  processName?: string;
  hours: number;
  hourlyCost?: number;
}

export interface LaborCostLineResult {
  id?: string;
  processKey?: string;
  processName?: string;
  hours: number;
  hourlyCost: number;
  subtotal: number;
}

export interface LaborSubtotalResult {
  lines: LaborCostLineResult[];
  totalHours: number;
  subtotal: number;
}

export interface CommercialChargesInput {
  impuestosPct?: number;
  publicidadPct?: number;
  comisionCobroPct?: number;
}

export interface CommercialChargesResult {
  baseCost: number;
  impuestosPct: number;
  publicidadPct: number;
  comisionCobroPct: number;
  totalPct: number;
  subtotal: number;
}

export interface BreakEvenInput {
  fixedCosts: number;
  unitPrice: number;
  unitCost: number;
}

export interface BreakEvenResult {
  contributionMarginPerUnit: number;
  breakEvenUnits: number | null;
  breakEvenRevenue: number | null;
}

function toNonNegative(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) {
    return 0;
  }

  return Math.max(0, Number(value));
}

export function calculateMaterialLineSubtotal(
  line: MaterialCostLineInput,
  options: { globalWastePct?: number; applyGlobalWaste?: boolean } = {},
): MaterialCostLineResult {
  const quantity = toNonNegative(line.quantity);
  const unitCost = toNonNegative(line.unitCost);
  const lineWastePct = toNonNegative(line.wastePct);
  const globalWastePct = options.applyGlobalWaste === false ? 0 : toNonNegative(options.globalWastePct);

  const baseSubtotal = round(quantity * unitCost, 4);
  const subtotalWithLineWaste = round(baseSubtotal * (1 + lineWastePct / 100), 4);
  const totalSubtotal = round(subtotalWithLineWaste * (1 + globalWastePct / 100), 4);
  const wasteSubtotal = round(totalSubtotal - baseSubtotal, 4);

  return {
    id: line.id,
    materialId: line.materialId,
    descripcion: line.descripcion,
    quantity,
    unitCost,
    lineWastePct,
    globalWastePct,
    baseSubtotal,
    wasteSubtotal,
    totalSubtotal,
  };
}

export function calculateMaterialsSubtotal(
  lines: MaterialCostLineInput[],
  options: { globalWastePct?: number; applyGlobalWaste?: boolean } = {},
): MaterialsSubtotalResult {
  const resolvedLines = lines.map((line) => calculateMaterialLineSubtotal(line, options));
  const baseSubtotal = round(resolvedLines.reduce((acc, line) => acc + line.baseSubtotal, 0), 4);
  const subtotal = round(resolvedLines.reduce((acc, line) => acc + line.totalSubtotal, 0), 4);
  const wasteSubtotal = round(subtotal - baseSubtotal, 4);

  return {
    lines: resolvedLines,
    baseSubtotal,
    wasteSubtotal,
    subtotal,
  };
}

export function calculateTotalHours(lines: LaborCostLineInput[]) {
  return round(lines.reduce((acc, line) => acc + toNonNegative(line.hours), 0), 4);
}

export function calculateLaborCost(totalHours: number, hourlyCost: number) {
  return round(toNonNegative(totalHours) * toNonNegative(hourlyCost), 4);
}

export function calculateLaborSubtotal(
  lines: LaborCostLineInput[],
  fallbackHourlyCost: number,
): LaborSubtotalResult {
  const safeFallbackCost = toNonNegative(fallbackHourlyCost);

  const resolvedLines = lines.map((line) => {
    const hours = toNonNegative(line.hours);
    const hourlyCost = toNonNegative(line.hourlyCost ?? safeFallbackCost);
    const subtotal = calculateLaborCost(hours, hourlyCost);

    return {
      id: line.id,
      processKey: line.processKey,
      processName: line.processName,
      hours,
      hourlyCost,
      subtotal,
    };
  });

  const totalHours = round(resolvedLines.reduce((acc, line) => acc + line.hours, 0), 4);
  const subtotal = round(resolvedLines.reduce((acc, line) => acc + line.subtotal, 0), 4);

  return {
    lines: resolvedLines,
    totalHours,
    subtotal,
  };
}

export function calculateDirectCost(materialSubtotal: number, laborSubtotal: number) {
  return round(toNonNegative(materialSubtotal) + toNonNegative(laborSubtotal), 4);
}

export function calculateCommercialCharges(
  baseCost: number,
  charges: CommercialChargesInput,
): CommercialChargesResult {
  const safeBaseCost = toNonNegative(baseCost);
  const impuestosPct = toNonNegative(charges.impuestosPct);
  const publicidadPct = toNonNegative(charges.publicidadPct);
  const comisionCobroPct = toNonNegative(charges.comisionCobroPct);
  const totalPct = round(impuestosPct + publicidadPct + comisionCobroPct, 4);
  const subtotal = round(safeBaseCost * (totalPct / 100), 4);

  return {
    baseCost: safeBaseCost,
    impuestosPct,
    publicidadPct,
    comisionCobroPct,
    totalPct,
    subtotal,
  };
}

export function calculateTotalCost(
  directCost: number,
  params: {
    commercialChargesCost?: number;
    extraFixedCost?: number;
  } = {},
) {
  return round(
    toNonNegative(directCost) +
      toNonNegative(params.commercialChargesCost) +
      toNonNegative(params.extraFixedCost),
    4,
  );
}

export function calculateSuggestedPriceByMargin(totalCost: number, marginPct: number) {
  const safeTotalCost = toNonNegative(totalCost);
  const safeMarginPct = toNonNegative(marginPct);

  if (safeMarginPct >= 100) {
    return 0;
  }

  return round(safeDiv(safeTotalCost, 1 - safeMarginPct / 100), 4);
}

export function calculateUtility(price: number, totalCost: number) {
  return round(toNonNegative(price) - toNonNegative(totalCost), 4);
}

export function calculateRealMarginPct(price: number, totalCost: number) {
  const utility = calculateUtility(price, totalCost);
  return round(safeDiv(utility, toNonNegative(price)) * 100, 4);
}

export function calculateBreakEvenPoint(input: BreakEvenInput): BreakEvenResult {
  const fixedCosts = toNonNegative(input.fixedCosts);
  const unitPrice = toNonNegative(input.unitPrice);
  const unitCost = toNonNegative(input.unitCost);
  const contributionMarginPerUnit = round(unitPrice - unitCost, 4);

  if (contributionMarginPerUnit <= 0) {
    return {
      contributionMarginPerUnit,
      breakEvenUnits: null,
      breakEvenRevenue: null,
    };
  }

  const breakEvenUnits = Math.ceil(fixedCosts / contributionMarginPerUnit);
  const breakEvenRevenue = round(breakEvenUnits * unitPrice, 4);

  return {
    contributionMarginPerUnit,
    breakEvenUnits,
    breakEvenRevenue,
  };
}
