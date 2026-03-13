import type { TableRow } from "@/types";
import { deleteTableRow, fetchTableRows, upsertTableRows } from "@/services/supabase";

const TABLE = "material_price_history" as const;
export type MaterialPriceHistoryRow = TableRow<typeof TABLE>;

export const materialPriceHistoryService = {
  list: () => fetchTableRows(TABLE),
  upsert: (rows: Array<Partial<MaterialPriceHistoryRow>>) => upsertTableRows(TABLE, rows),
  remove: (id: string) => deleteTableRow(TABLE, id),
};
