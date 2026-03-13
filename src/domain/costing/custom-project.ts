import {
  calculateCommercialCharges,
  calculateDirectCost,
  calculateLaborSubtotal,
  calculateMaterialsSubtotal,
  calculateRealMarginPct,
  calculateSuggestedPriceByMargin,
  calculateTotalCost,
  calculateUtility,
  type CostingGlobalSettingsInput,
  type LaborCostLineInput,
  type LaborSubtotalResult,
  type MaterialCostLineInput,
  type MaterialsSubtotalResult,
} from "@/domain/costing/engine";

export interface CustomProjectCostInput {
  settings: CostingGlobalSettingsInput;
  materials: MaterialCostLineInput[];
  labor: LaborCostLineInput[];
  marginPct?: number;
  targetPrice?: number | null;
  applyGlobalMaterialWaste?: boolean;
  includeCommercialCharges?: boolean;
}

export interface CustomProjectCostResult {
  channel: "custom_project";
  materials: MaterialsSubtotalResult;
  labor: LaborSubtotalResult;
  subtotalMateriales: number;
  horasTotales: number;
  costoManoObra: number;
  costoDirecto: number;
  costoCargosComerciales: number;
  costoTotal: number;
  margenObjetivoPct: number;
  precioSugerido: number;
  precioEvaluado: number;
  utilidad: number;
  margenRealPct: number;
}

export interface CustomProjectCostSnapshot {
  channel: "custom_project";
  settings: CostingGlobalSettingsInput;
  inputs: {
    materials: MaterialCostLineInput[];
    labor: LaborCostLineInput[];
    marginPct: number;
    targetPrice: number | null;
    applyGlobalMaterialWaste: boolean;
    includeCommercialCharges: boolean;
  };
  result: CustomProjectCostResult;
}

export function calculateCustomProjectCost(input: CustomProjectCostInput): CustomProjectCostResult {
  const marginPct = input.marginPct ?? input.settings.margenMedidaPct;
  const applyGlobalMaterialWaste = input.applyGlobalMaterialWaste ?? true;
  const includeCommercialCharges = input.includeCommercialCharges ?? true;

  const materials = calculateMaterialsSubtotal(input.materials, {
    globalWastePct: input.settings.desperdicioMelaminaPct,
    applyGlobalWaste: applyGlobalMaterialWaste,
  });

  const labor = calculateLaborSubtotal(input.labor, input.settings.costoHoraTaller);
  const costoDirecto = calculateDirectCost(materials.subtotal, labor.subtotal);
  const commercialCharges = includeCommercialCharges
    ? calculateCommercialCharges(costoDirecto, {
        impuestosPct: input.settings.impuestosPct,
        publicidadPct: input.settings.publicidadPct,
        comisionCobroPct: input.settings.comisionCobroPct,
      })
    : calculateCommercialCharges(0, {});

  const costoTotal = calculateTotalCost(costoDirecto, {
    commercialChargesCost: commercialCharges.subtotal,
  });
  const precioSugerido = calculateSuggestedPriceByMargin(costoTotal, marginPct);
  const precioEvaluado = input.targetPrice ?? precioSugerido;
  const utilidad = calculateUtility(precioEvaluado, costoTotal);
  const margenRealPct = calculateRealMarginPct(precioEvaluado, costoTotal);

  return {
    channel: "custom_project",
    materials,
    labor,
    subtotalMateriales: materials.subtotal,
    horasTotales: labor.totalHours,
    costoManoObra: labor.subtotal,
    costoDirecto,
    costoCargosComerciales: commercialCharges.subtotal,
    costoTotal,
    margenObjetivoPct: marginPct,
    precioSugerido,
    precioEvaluado,
    utilidad,
    margenRealPct,
  };
}

export function buildCustomProjectCostSnapshot(
  input: CustomProjectCostInput,
  result: CustomProjectCostResult,
): CustomProjectCostSnapshot {
  return {
    channel: "custom_project",
    settings: input.settings,
    inputs: {
      materials: input.materials,
      labor: input.labor,
      marginPct: input.marginPct ?? input.settings.margenMedidaPct,
      targetPrice: input.targetPrice ?? null,
      applyGlobalMaterialWaste: input.applyGlobalMaterialWaste ?? true,
      includeCommercialCharges: input.includeCommercialCharges ?? true,
    },
    result,
  };
}
