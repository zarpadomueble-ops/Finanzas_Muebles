"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useState } from "react";
import { SearchInput } from "@/components/forms/search-input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface DataGridProps<TData extends object> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  searchPlaceholder?: string;
  toolbarSlot?: ReactNode;
  hideSearch?: boolean;
}

export function DataGrid<TData extends object>({
  data,
  columns,
  searchPlaceholder = "Buscar...",
  toolbarSlot,
  hideSearch = false,
}: DataGridProps<TData>) {
  const [globalFilter, setGlobalFilter] = useState("");

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: {
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;
  const rowCount = table.getFilteredRowModel().rows.length;
  const columnCount = table.getAllLeafColumns().length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {hideSearch ? null : (
          <SearchInput
            className="w-full max-w-sm"
            placeholder={searchPlaceholder}
            ariaLabel={searchPlaceholder}
            value={globalFilter ?? ""}
            onChange={setGlobalFilter}
          />
        )}
        <div className="ml-auto flex items-center gap-3">
          {toolbarSlot}
          <p className="text-xs text-slate-500">{rowCount} resultados</p>
        </div>
      </div>

      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {rows.length > 0 ? rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
              ))}
            </TableRow>
          )) : (
            <TableRow>
              <TableCell colSpan={columnCount} className="py-8 text-center text-sm text-slate-500">
                {globalFilter?.trim()
                  ? "No hay resultados para la busqueda actual."
                  : "No hay registros para mostrar."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
