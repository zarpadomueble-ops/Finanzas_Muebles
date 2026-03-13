import type { TableRow } from "@/types";
import { deleteTableRow, fetchTableRows, upsertTableRows } from "@/services/supabase";

const TABLE = "ecommerce_product_processes" as const;
export type EcommerceProductProcessRow = TableRow<typeof TABLE>;

export const ecommerceProductProcessesService = {
  list: () => fetchTableRows(TABLE),
  upsert: (rows: Array<Partial<EcommerceProductProcessRow>>) => upsertTableRows(TABLE, rows),
  remove: (id: string) => deleteTableRow(TABLE, id),
};
