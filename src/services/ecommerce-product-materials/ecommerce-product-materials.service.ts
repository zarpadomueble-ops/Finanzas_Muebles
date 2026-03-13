import type { TableRow } from "@/types";
import { deleteTableRow, fetchTableRows, upsertTableRows } from "@/services/supabase";

const TABLE = "ecommerce_product_materials" as const;
export type EcommerceProductMaterialRow = TableRow<typeof TABLE>;

export const ecommerceProductMaterialsService = {
  list: () => fetchTableRows(TABLE),
  upsert: (rows: Array<Partial<EcommerceProductMaterialRow>>) => upsertTableRows(TABLE, rows),
  remove: (id: string) => deleteTableRow(TABLE, id),
};
