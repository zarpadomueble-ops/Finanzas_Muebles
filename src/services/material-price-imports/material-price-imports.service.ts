import {
  detectCsvColumnMapping,
  validateCsvRows,
  type CsvColumnMapping,
  type ImportStrategy,
} from "@/domain/material-imports";
import { getAuthorizedBrowserContext } from "@/services/shared/authenticated-client";
import type { PostgrestError } from "@supabase/supabase-js";
import type { TableInsert, TableRow } from "@/types";

const MATERIAL_PRICE_LISTS_TABLE = "material_price_lists" as const;
const MATERIAL_PRICE_IMPORTS_TABLE = "material_price_imports" as const;
const MATERIAL_PRICE_IMPORT_ROWS_TABLE = "material_price_import_rows" as const;

type QueryResponse<T> = {
  data: T | null;
  error: PostgrestError | null;
};

type MaterialPriceListRow = TableRow<typeof MATERIAL_PRICE_LISTS_TABLE>;
type MaterialPriceImportRow = TableRow<typeof MATERIAL_PRICE_IMPORTS_TABLE>;

export interface ProcessPriceListImportInput {
  supplier_id: string;
  name: string;
  source_filename: string;
  effective_date: string;
  currency?: string;
  strategy: ImportStrategy;
  rows: Array<Record<string, unknown>>;
  column_mapping?: CsvColumnMapping;
  notes?: string | null;
}

export const materialPriceImportsService = {
  detectCsvColumnMapping,
  validateCsvRows,

  async listPriceLists() {
    const context = await getAuthorizedBrowserContext();
    const response = (await context.client
      .from(MATERIAL_PRICE_LISTS_TABLE as never)
      .select("*, supplier:suppliers(id, nombre)")
      .eq("profile_id", context.userId)
      .is("deleted_at", null)
      .order("effective_date", { ascending: false })) as QueryResponse<MaterialPriceListRow[]>;

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data ?? [];
  },

  async listImports() {
    const context = await getAuthorizedBrowserContext();
    const response = (await context.client
      .from(MATERIAL_PRICE_IMPORTS_TABLE as never)
      .select("*, supplier:suppliers(id, nombre), price_list:material_price_lists(id, name, effective_date)")
      .eq("profile_id", context.userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })) as QueryResponse<MaterialPriceImportRow[]>;

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.data ?? [];
  },

  async processPriceListImport(input: ProcessPriceListImportInput) {
    const context = await getAuthorizedBrowserContext();
    const mapping =
      input.column_mapping ??
      detectCsvColumnMapping(
        input.rows.flatMap((row) => Object.keys(row)).filter((value, index, array) => array.indexOf(value) === index),
      );
    const validatedRows = validateCsvRows(input.rows, mapping);
    const summary = {
      total: validatedRows.length,
      inserted: 0,
      updated: 0,
      ignored: 0,
      failed: validatedRows.filter((row) => row.errors.length > 0).length,
    };

    const priceListResponse = (await context.client
      .from(MATERIAL_PRICE_LISTS_TABLE as never)
      .insert(
        {
          profile_id: context.userId,
          supplier_id: input.supplier_id,
          name: input.name,
          source_filename: input.source_filename,
          effective_date: input.effective_date,
          currency: input.currency ?? "ARS",
          status: "previewed",
          notes: input.notes ?? null,
          created_by: context.userId,
          updated_by: context.userId,
        } as TableInsert<typeof MATERIAL_PRICE_LISTS_TABLE> as never,
      )
      .select("*")
      .single()) as QueryResponse<MaterialPriceListRow>;

    if (priceListResponse.error || !priceListResponse.data) {
      throw new Error(priceListResponse.error?.message || "No se pudo registrar la lista de precios.");
    }

    const importResponse = (await context.client
      .from(MATERIAL_PRICE_IMPORTS_TABLE as never)
      .insert(
        {
          profile_id: context.userId,
          price_list_id: priceListResponse.data.id,
          supplier_id: input.supplier_id,
          strategy: input.strategy,
          column_mapping: mapping,
          detected_columns: Object.keys(mapping),
          summary_total_rows: summary.total,
          summary_inserted: summary.inserted,
          summary_updated: summary.updated,
          summary_ignored: summary.ignored,
          summary_failed: summary.failed,
          imported_by: context.userId,
          status: summary.failed > 0 ? "failed" : "completed",
          source_filename: input.source_filename,
          effective_date: input.effective_date,
          created_by: context.userId,
          updated_by: context.userId,
        } as TableInsert<typeof MATERIAL_PRICE_IMPORTS_TABLE> as never,
      )
      .select("*")
      .single()) as QueryResponse<MaterialPriceImportRow>;

    if (importResponse.error || !importResponse.data) {
      throw new Error(importResponse.error?.message || "No se pudo registrar la corrida de importacion.");
    }

    const importRun = importResponse.data;

    if (validatedRows.length > 0) {
      const rowsResponse = (await context.client
        .from(MATERIAL_PRICE_IMPORT_ROWS_TABLE as never)
        .insert(
          validatedRows.map(
            (row) =>
              ({
                profile_id: context.userId,
                import_id: importRun.id,
                row_number: row.rowNumber,
                action: row.errors.length > 0 ? "failed" : "ignored",
                match_type: "none",
                matched_material_id: null,
                raw_row: row.rawRow,
                normalized_row: row.normalizedRow,
                validation_errors: row.errors,
                created_by: context.userId,
                updated_by: context.userId,
              }) as TableInsert<typeof MATERIAL_PRICE_IMPORT_ROWS_TABLE>,
          ) as never,
        )) as QueryResponse<unknown[]>;

      if (rowsResponse.error) {
        throw new Error(rowsResponse.error.message);
      }
    }

    return {
      priceList: priceListResponse.data,
      importRun,
      mapping,
      summary,
      rows: validatedRows,
    };
  },
};
