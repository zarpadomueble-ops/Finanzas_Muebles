import { round, safeDiv } from "@/lib/utils";

export function calculateWorkshopHourCost(costosFijosMes: number, horasProductivasMes: number) {
  if (horasProductivasMes <= 0) {
    return 0;
  }

  return round(safeDiv(costosFijosMes, horasProductivasMes), 2);
}
