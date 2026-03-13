import { round } from "@/lib/utils";
import type { PurchaseCsvHeader, PurchaseDraftItem } from "./types";

function escapeCsvValue(value: string | number | null | undefined) {
  const normalized = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

export function buildPurchaseOrderCsv(
  header: PurchaseCsvHeader,
  items: Array<Pick<PurchaseDraftItem, "description" | "quantity" | "unit" | "unitCost" | "subtotal">>,
) {
  const lines = [
    ["Compra", header.id],
    ["Proveedor", header.supplierName ?? "Sin proveedor"],
    ["Origen", header.sourceLabel],
    ["Estado", header.status],
    ["Fecha emision", header.issueDate],
    ["Fecha entrega estimada", header.expectedDate ?? ""],
    ["Moneda", header.currency],
    ["Notas", header.notes ?? ""],
    [],
    ["Descripcion", "Cantidad", "Unidad", "Costo unitario", "Subtotal"],
    ...items.map((item) => [
      item.description,
      round(item.quantity, 4),
      item.unit,
      round(item.unitCost, 4),
      round(item.subtotal, 2),
    ]),
  ];

  return lines
    .map((row) => row.map((value) => escapeCsvValue(value)).join(","))
    .join("\n");
}
