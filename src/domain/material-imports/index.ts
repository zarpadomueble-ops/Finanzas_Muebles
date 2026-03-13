import type { Json } from "@/types";

export const SUPPORTED_PRICE_IMPORT_COLUMNS = [
  "codigo",
  "descripcion",
  "categoria",
  "unidad",
  "marca",
  "espesor",
  "largo",
  "ancho",
  "color",
  "proveedor",
  "costo",
  "precio_lista",
  "fecha_vigencia",
  "observaciones",
] as const;

export type SupportedPriceImportColumn = (typeof SUPPORTED_PRICE_IMPORT_COLUMNS)[number];
export type ImportStrategy = "replace_prices" | "update_matched_only" | "create_missing" | "ignore_duplicates";
export type CsvColumnMapping = Partial<Record<SupportedPriceImportColumn, string>>;

export interface ValidatedCsvRow {
  rowNumber: number;
  rawRow: Record<string, unknown>;
  normalizedRow: Json;
  errors: string[];
}

const COLUMN_ALIASES: Record<SupportedPriceImportColumn, string[]> = {
  codigo: ["codigo", "code", "sku"],
  descripcion: ["descripcion", "description", "detalle", "nombre"],
  categoria: ["categoria", "rubro"],
  unidad: ["unidad", "unit"],
  marca: ["marca", "brand"],
  espesor: ["espesor", "thickness"],
  largo: ["largo", "length"],
  ancho: ["ancho", "width"],
  color: ["color"],
  proveedor: ["proveedor", "supplier"],
  costo: ["costo", "precio_costo", "cost"],
  precio_lista: ["precio_lista", "price_list", "lista"],
  fecha_vigencia: ["fecha_vigencia", "vigencia", "effective_date"],
  observaciones: ["observaciones", "obs", "notes"],
};

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_");
}

function normalizeString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeDate(value: unknown) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return null;
  }

  return normalized.includes("T") ? normalized.slice(0, 10) : normalized;
}

export function detectCsvColumnMapping(headers: string[]): CsvColumnMapping {
  const normalizedHeaders = new Map(headers.map((header) => [normalizeHeader(header), header]));
  const mapping: CsvColumnMapping = {};

  for (const column of SUPPORTED_PRICE_IMPORT_COLUMNS) {
    const alias = COLUMN_ALIASES[column].find((candidate) => normalizedHeaders.has(candidate));
    if (alias) {
      mapping[column] = normalizedHeaders.get(alias);
    }
  }

  return mapping;
}

export function validateCsvRows(
  rows: Array<Record<string, unknown>>,
  mapping: CsvColumnMapping,
): ValidatedCsvRow[] {
  return rows.map((row, index) => {
    const normalizedRow = {
      codigo: mapping.codigo ? normalizeString(row[mapping.codigo]) : null,
      descripcion: mapping.descripcion ? normalizeString(row[mapping.descripcion]) : null,
      categoria: mapping.categoria ? normalizeString(row[mapping.categoria]) : null,
      unidad: mapping.unidad ? normalizeString(row[mapping.unidad]) : null,
      marca: mapping.marca ? normalizeString(row[mapping.marca]) : null,
      espesor: mapping.espesor ? normalizeNumber(row[mapping.espesor]) : null,
      largo: mapping.largo ? normalizeNumber(row[mapping.largo]) : null,
      ancho: mapping.ancho ? normalizeNumber(row[mapping.ancho]) : null,
      color: mapping.color ? normalizeString(row[mapping.color]) : null,
      proveedor: mapping.proveedor ? normalizeString(row[mapping.proveedor]) : null,
      costo: mapping.costo ? normalizeNumber(row[mapping.costo]) : null,
      precio_lista: mapping.precio_lista ? normalizeNumber(row[mapping.precio_lista]) : null,
      fecha_vigencia: mapping.fecha_vigencia ? normalizeDate(row[mapping.fecha_vigencia]) : null,
      observaciones: mapping.observaciones ? normalizeString(row[mapping.observaciones]) : null,
    };

    const errors: string[] = [];
    if (!normalizedRow.codigo && !normalizedRow.descripcion) {
      errors.push("Falta codigo o descripcion.");
    }

    if (mapping.costo && normalizedRow.costo === null) {
      errors.push("Costo invalido.");
    }

    if (mapping.precio_lista && normalizedRow.precio_lista === null) {
      errors.push("Precio de lista invalido.");
    }

    return {
      rowNumber: index + 1,
      rawRow: row,
      normalizedRow: normalizedRow as Json,
      errors,
    };
  });
}
