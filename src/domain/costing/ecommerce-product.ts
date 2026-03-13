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

export interface EcommerceProductCostInput {
  settings: CostingGlobalSettingsInput;
  materials: MaterialCostLineInput[];
  labor: LaborCostLineInput[];
  packagingUnitCost?: number;
  shippingUnitCost?: number;
  marginPct?: number;
  marketPrice?: number | null;
  applyGlobalMaterialWaste?: boolean;
  includeCommercialCharges?: boolean;
}

export interface EcommerceProductCostResult {
  channel: "ecommerce_product";
  materials: MaterialsSubtotalResult;
  labor: LaborSubtotalResult;
  costoMaterialesUnit: number;
  horasTotalesUnit: number;
  costoManoObraUnit: number;
  costoDirectoUnit: number;
  costoLogisticaUnit: number;
  costoCargosComercialesUnit: number;
  costoTotalUnit: number;
  margenObjetivoPct: number;
  precioSugerido: number;
  precioEvaluado: number;
  utilidadUnit: number;
  margenRealPct: number;
}

export interface EcommerceProductCostSnapshot {
  channel: "ecommerce_product";
  settings: CostingGlobalSettingsInput;
  inputs: {
    materials: MaterialCostLineInput[];
    labor: LaborCostLineInput[];
    packagingUnitCost: number;
    shippingUnitCost: number;
    marginPct: number;
    marketPrice: number | null;
    applyGlobalMaterialWaste: boolean;
    includeCommercialCharges: boolean;
  };
  result: EcommerceProductCostResult;
}

export function calculateEcommerceProductCost(input: EcommerceProductCostInput): EcommerceProductCostResult {
  const marginPct = input.marginPct ?? input.settings.margenEcommercePct;
  const applyGlobalMaterialWaste = input.applyGlobalMaterialWaste ?? true;
  const includeCommercialCharges = input.includeCommercialCharges ?? true;
  const packagingUnitCost = (input.packagingUnitCost ?? 0) + input.settings.embalajePromedio;
  const shippingUnitCost = (input.shippingUnitCost ?? 0) + input.settings.envioPromedio;

  const materials = calculateMaterialsSubtotal(input.materials, {
    globalWastePct: input.settings.desperdicioMelaminaPct,
    applyGlobalWaste: applyGlobalMaterialWaste,
  });
  const labor = calculateLaborSubtotal(input.labor, input.settings.costoHoraTaller);

  const costoDirectoUnit = calculateDirectCost(materials.subtotal, labor.subtotal);
  const costoLogisticaUnit = packagingUnitCost + shippingUnitCost;
  const costoPrevioCargos = calculateTotalCost(costoDirectoUnit, {
    extraFixedCost: costoLogisticaUnit,
  });

  const commercialCharges = includeCommercialCharges
    ? calculateCommercialCharges(costoPrevioCargos, {
        impuestosPct: input.settings.impuestosPct,
        publicidadPct: input.settings.publicidadPct,
        comisionCobroPct: input.settings.comisionCobroPct,
      })
    : calculateCommercialCharges(0, {});

  const costoTotalUnit = calculateTotalCost(costoPrevioCargos, {
    commercialChargesCost: commercialCharges.subtotal,
  });
  const precioSugerido = calculateSuggestedPriceByMargin(costoTotalUnit, marginPct);
  const precioEvaluado = input.marketPrice ?? precioSugerido;
  const utilidadUnit = calculateUtility(precioEvaluado, costoTotalUnit);
  const margenRealPct = calculateRealMarginPct(precioEvaluado, costoTotalUnit);

  return {
    channel: "ecommerce_product",
    materials,
    labor,
    costoMaterialesUnit: materials.subtotal,
    horasTotalesUnit: labor.totalHours,
    costoManoObraUnit: labor.subtotal,
    costoDirectoUnit,
    costoLogisticaUnit,
    costoCargosComercialesUnit: commercialCharges.subtotal,
    costoTotalUnit,
    margenObjetivoPct: marginPct,
    precioSugerido,
    precioEvaluado,
    utilidadUnit,
    margenRealPct,
  };
}

export function buildEcommerceProductCostSnapshot(
  input: EcommerceProductCostInput,
  result: EcommerceProductCostResult,
): EcommerceProductCostSnapshot {
  return {
    channel: "ecommerce_product",
    settings: input.settings,
    inputs: {
      materials: input.materials,
      labor: input.labor,
      packagingUnitCost: input.packagingUnitCost ?? 0,
      shippingUnitCost: input.shippingUnitCost ?? 0,
      marginPct: input.marginPct ?? input.settings.margenEcommercePct,
      marketPrice: input.marketPrice ?? null,
      applyGlobalMaterialWaste: input.applyGlobalMaterialWaste ?? true,
      includeCommercialCharges: input.includeCommercialCharges ?? true,
    },
    result,
  };
}
