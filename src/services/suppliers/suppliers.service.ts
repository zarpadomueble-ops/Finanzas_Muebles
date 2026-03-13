import type { TableRow } from "@/types";
import { deleteTableRow, fetchTableRows, upsertTableRows } from "@/services/supabase";

const TABLE = "suppliers" as const;
export type SupplierRow = TableRow<typeof TABLE>;

export const suppliersService = {
  list: () => fetchTableRows(TABLE),
  upsert: (rows: Array<Partial<SupplierRow>>) => upsertTableRows(TABLE, rows),
  remove: (id: string) => deleteTableRow(TABLE, id),
};
