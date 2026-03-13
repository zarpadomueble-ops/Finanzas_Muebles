import type { TableRow } from "@/types";
import { deleteTableRow, fetchTableRows, upsertTableRows } from "@/services/supabase";

const TABLE = "budget_items" as const;
export type BudgetItemRow = TableRow<typeof TABLE>;

export const budgetItemsService = {
  list: () => fetchTableRows(TABLE),
  upsert: (rows: Array<Partial<BudgetItemRow>>) => upsertTableRows(TABLE, rows),
  remove: (id: string) => deleteTableRow(TABLE, id),
};
