import { calculateWorkshopHourCost } from "@/domain/costing/settings";
import { settingsService } from "@/services/settings";
import type { SettingsFormInput } from "../schemas";

function mapSettingsPayload(input: SettingsFormInput) {
  const autoCost = calculateWorkshopHourCost(input.costos_fijos_mes, input.horas_productivas_mes);
  const manualCost = input.usar_costo_hora_taller_manual ? input.costo_hora_taller : null;
  const effectiveCost =
    input.usar_costo_hora_taller_manual && manualCost !== null ? manualCost : autoCost;

  return {
    horas_productivas_mes: input.horas_productivas_mes,
    costos_fijos_mes: input.costos_fijos_mes,
    costo_hora_taller: effectiveCost,
    usar_costo_hora_taller_manual: input.usar_costo_hora_taller_manual,
    costo_hora_taller_manual: manualCost,
    desperdicio_melamina_pct: input.desperdicio_melamina_pct,
    margen_medida_pct: input.margen_medida_pct,
    margen_ecommerce_pct: input.margen_ecommerce_pct,
    impuestos_pct: input.impuestos_pct,
    publicidad_pct: input.publicidad_pct,
    comision_cobro_pct: input.comision_cobro_pct,
    embalaje_promedio: input.embalaje_promedio,
    envio_promedio: input.envio_promedio,
    kerf_sierra_mm: input.kerf_sierra_mm,
    margen_perimetral_placa_mm: input.margen_perimetral_placa_mm,
    permitir_rotacion_por_defecto: input.permitir_rotacion_por_defecto,
    veta_obligatoria_por_defecto: input.veta_obligatoria_por_defecto,
  };
}

export async function getCurrentSettingsRecord() {
  return settingsService.getCurrent();
}

export async function saveCurrentSettingsRecord(input: SettingsFormInput) {
  return settingsService.saveCurrent(mapSettingsPayload(input));
}
