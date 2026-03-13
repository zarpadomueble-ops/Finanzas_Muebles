import type { PublicTableName, TableRow } from "@/types";
import { deleteTableRow, fetchTableRows, upsertTableRows } from "@/services/supabase";

export async function fetchRows<T extends PublicTableName>(table: T): Promise<TableRow<T>[]> {
  return fetchTableRows(table);
}

export async function upsertRows<T extends PublicTableName>(table: T, rows: Array<Partial<TableRow<T>>>) {
  return upsertTableRows(table, rows);
}

export async function deleteRow<T extends PublicTableName>(table: T, id: string) {
  return deleteTableRow(table, id);
}
