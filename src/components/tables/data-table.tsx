import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { DataGrid } from "@/components/tables/data-grid";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { SectionCard } from "@/components/shared/section-card";

interface DataTableProps<TData extends object> {
  title?: string;
  description?: string;
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  searchPlaceholder?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  actions?: ReactNode;
}

export function DataTable<TData extends object>({
  title,
  description,
  data,
  columns,
  isLoading = false,
  error,
  onRetry,
  searchPlaceholder,
  emptyTitle = "Sin registros",
  emptyDescription = "Todavia no hay datos para esta vista.",
  actions,
}: DataTableProps<TData>) {
  return (
    <SectionCard title={title} description={description} actions={actions}>
      {isLoading ? (
        <LoadingState title="Cargando tabla" description="Preparando registros..." />
      ) : error ? (
        <ErrorState description={error} onRetry={onRetry} />
      ) : data.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <DataGrid data={data} columns={columns} searchPlaceholder={searchPlaceholder} />
      )}
    </SectionCard>
  );
}
