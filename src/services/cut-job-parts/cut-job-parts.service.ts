import type { TableRow } from "@/types";
import { deleteTableRow, fetchTableRows, upsertTableRows } from "@/services/supabase";

const TABLE = "cut_job_parts" as const;
export type CutJobPartRow = TableRow<typeof TABLE>;

export const cutJobPartsService = {
  list: () => fetchTableRows(TABLE),
  upsert: (rows: Array<Partial<CutJobPartRow>>) => upsertTableRows(TABLE, rows),
  remove: (id: string) => deleteTableRow(TABLE, id),
};
