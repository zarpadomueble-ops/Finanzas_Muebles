import { calculateEcommerceProductCost } from "@/domain/costing/ecommerce-product";
import type { CostingGlobalSettingsInput, LaborCostLineInput, MaterialCostLineInput } from "@/domain/costing/engine";
import { ProductMaterial, Settings } from "@/lib/types";

export interface EcommerceTotals {
  costoMaterialesUnit: number;
  costoManoObraUnit: number;
  costoBaseUnit: number;
  costoConEmbalaje: number;
  costoTotalCanal: number;
  precioSugerido: number;
  gananciaUnit: number;
}

function mapLegacySettings(settings: Settings): CostingGlobalSettingsInput {
  return {
    horasProductivasMes: settings.horasProductivasMes,
    costosFijosMes: settings.costosFijosMes,
    costoHoraTaller: settings.costoHoraTaller,
    desperdicioMelaminaPct: settings.desperdicioMelaminaPct,
    margenMedidaPct: settings.margenMedidaPct,
    margenEcommercePct: settings.margenEcommercePct,
    impuestosPct: settings.impuestosPct,
    publicidadPct: settings.publicidadPct,
    comisionCobroPct: settings.comisionCobroPct,
    embalajePromedio: settings.embalajePromedio,
    envioPromedio: settings.envioPromedio,
  };
}

function mapLegacyProductMaterials(materials: ProductMaterial[]): MaterialCostLineInput[] {
  return materials.map((line) => ({
    id: line.id,
    materialId: line.materialId,
    quantity: line.consumoUnit,
    unitCost: line.costoUnitarioSnapshot,
  }));
}

export function calculateEcommerceTotals(params: {
  settings: Settings;
  materiales: ProductMaterial[];
  horasUnit: number;
  precioMercado?: number;
  embalajeUnitario: number;
  envioUnitario: number;
}): EcommerceTotals {
  const labor: LaborCostLineInput[] = [
    {
      processKey: "proceso_unit",
      hours: params.horasUnit,
    },
  ];

  const result = calculateEcommerceProductCost({
    settings: mapLegacySettings(params.settings),
    materials: mapLegacyProductMaterials(params.materiales),
    labor,
    packagingUnitCost: params.embalajeUnitario,
    shippingUnitCost: params.envioUnitario,
    marketPrice: params.precioMercado ?? null,
    marginPct: params.settings.margenEcommercePct,
    applyGlobalMaterialWaste: true,
    includeCommercialCharges: false,
  });

  const costoBaseUnit = result.costoDirectoUnit;
  const costoConEmbalaje = costoBaseUnit + params.embalajeUnitario + params.settings.embalajePromedio;

  return {
    costoMaterialesUnit: result.costoMaterialesUnit,
    costoManoObraUnit: result.costoManoObraUnit,
    costoBaseUnit,
    costoConEmbalaje,
    costoTotalCanal: result.costoTotalUnit,
    precioSugerido: result.precioSugerido,
    gananciaUnit: result.utilidadUnit,
  };
}
