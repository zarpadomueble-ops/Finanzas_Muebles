import type { TableRow } from "@/types";
import { deleteTableRow, fetchTableRows, upsertTableRows } from "@/services/supabase";

const TABLE = "attachments" as const;
export type AttachmentRow = TableRow<typeof TABLE>;

export const attachmentsService = {
  list: () => fetchTableRows(TABLE),
  upsert: (rows: Array<Partial<AttachmentRow>>) => upsertTableRows(TABLE, rows),
  remove: (id: string) => deleteTableRow(TABLE, id),
};
