import type { TableRow } from "@/types";
import { deleteTableRow, fetchTableRows, upsertTableRows } from "@/services/supabase";

const TABLE = "custom_project_labor" as const;
export type CustomProjectLaborRow = TableRow<typeof TABLE>;

export const customProjectLaborService = {
  list: () => fetchTableRows(TABLE),
  upsert: (rows: Array<Partial<CustomProjectLaborRow>>) => upsertTableRows(TABLE, rows),
  remove: (id: string) => deleteTableRow(TABLE, id),
};
