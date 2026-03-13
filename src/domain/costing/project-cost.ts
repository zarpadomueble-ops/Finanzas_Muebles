import { calculateCustomProjectCost } from "@/domain/costing/custom-project";
import type { CostingGlobalSettingsInput, LaborCostLineInput, MaterialCostLineInput } from "@/domain/costing/engine";
import { ProjectLabor, ProjectMaterial, Settings } from "@/lib/types";

export interface ProjectTotals {
  subtotalMateriales: number;
  horasTotales: number;
  costoManoObra: number;
  costoDirecto: number;
  costoTotal: number;
  precioSugerido: number;
  utilidadEstimada: number;
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

function mapLegacyProjectMaterials(materials: ProjectMaterial[]): MaterialCostLineInput[] {
  return materials.map((line) => ({
    id: line.id,
    materialId: line.materialId,
    quantity: line.consumo,
    unitCost: line.costoUnitarioSnapshot,
  }));
}

function mapLegacyProjectLabor(labor: ProjectLabor[]): LaborCostLineInput[] {
  return labor.map((line) => ({
    id: line.id,
    processKey: line.proceso,
    hours: line.horas,
  }));
}

export function calculateProjectTotals(
  settings: Settings,
  materials: ProjectMaterial[],
  labor: ProjectLabor[],
  customPrice?: number,
): ProjectTotals {
  const result = calculateCustomProjectCost({
    settings: mapLegacySettings(settings),
    materials: mapLegacyProjectMaterials(materials),
    labor: mapLegacyProjectLabor(labor),
    targetPrice: customPrice ?? null,
    marginPct: settings.margenMedidaPct,
    applyGlobalMaterialWaste: true,
    includeCommercialCharges: true,
  });

  return {
    subtotalMateriales: result.subtotalMateriales,
    horasTotales: result.horasTotales,
    costoManoObra: result.costoManoObra,
    costoDirecto: result.costoDirecto,
    costoTotal: result.costoTotal,
    precioSugerido: result.precioSugerido,
    utilidadEstimada: result.utilidad,
  };
}
