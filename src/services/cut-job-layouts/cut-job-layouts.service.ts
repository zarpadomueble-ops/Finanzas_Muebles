import type { TableRow } from "@/types";
import { deleteTableRow, fetchTableRows, upsertTableRows } from "@/services/supabase";

const TABLE = "cut_job_layouts" as const;
export type CutJobLayoutRow = TableRow<typeof TABLE>;

export const cutJobLayoutsService = {
  list: () => fetchTableRows(TABLE),
  upsert: (rows: Array<Partial<CutJobLayoutRow>>) => upsertTableRows(TABLE, rows),
  remove: (id: string) => deleteTableRow(TABLE, id),
};
