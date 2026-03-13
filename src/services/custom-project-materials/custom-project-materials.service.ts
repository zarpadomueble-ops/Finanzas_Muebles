import type { TableRow } from "@/types";
import { deleteTableRow, fetchTableRows, upsertTableRows } from "@/services/supabase";

const TABLE = "custom_project_materials" as const;
export type CustomProjectMaterialRow = TableRow<typeof TABLE>;

export const customProjectMaterialsService = {
  list: () => fetchTableRows(TABLE),
  upsert: (rows: Array<Partial<CustomProjectMaterialRow>>) => upsertTableRows(TABLE, rows),
  remove: (id: string) => deleteTableRow(TABLE, id),
};
