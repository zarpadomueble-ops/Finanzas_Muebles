import { calculateBreakEvenPoint, calculateRealMarginPct, calculateUtility } from "@/domain/costing/engine";
import { AppState } from "@/lib/types";
import { round, safeDiv } from "@/lib/utils";

export function getDashboardKpis(state: AppState) {
  const ventasTotal = state.budgets.reduce((acc, budget) => acc + (budget.status === "aprobado" ? budget.total : 0), 0);
  const costoTotal = state.financialRecords.reduce((acc, row) => acc + row.costo, 0);
  const ganancia = ventasTotal - costoTotal;
  const margenPromedio = safeDiv(ganancia, ventasTotal) * 100;
  const pendientesCobro = state.clients.reduce((acc, client) => acc + client.saldoPendiente, 0);

  return {
    ventasTotal: round(ventasTotal),
    costoTotal: round(costoTotal),
    ganancia: round(ganancia),
    margenPromedio: round(margenPromedio),
    pendientesCobro: round(pendientesCobro),
    proyectosActivos: state.jobsBoard.filter((job) => ["aprobado", "en_produccion", "instalado"].includes(job.estado)).length,
  };
}

export function getProfitabilityRows(state: AppState) {
  return state.financialRecords.map((row) => ({
    ...row,
    utilidad: calculateUtility(row.precio, row.costo),
    margenPct: calculateRealMarginPct(row.precio, row.costo),
  }));
}

export function getBreakEven(settingsCostosFijos: number, price: number, cost: number) {
  const result = calculateBreakEvenPoint({
    fixedCosts: settingsCostosFijos,
    unitPrice: price,
    unitCost: cost,
  });

  return {
    gananciaUnidad: result.contributionMarginPerUnit,
    puntoEquilibrioUnidades: result.breakEvenUnits ?? 0,
  };
}
