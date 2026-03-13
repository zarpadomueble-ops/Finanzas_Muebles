import {
  normalizeMaterialCategory,
  normalizeMaterialUnit,
} from "@/domain/costing/materials";
import {
  MaterialCsvInputSchema,
  type MaterialCsvInput,
  type MaterialFormInput,
  type MaterialsQueryInput,
} from "../schemas";
import { materialsService } from "@/services/materials";
import { suppliersService } from "@/services/suppliers";

type CsvRawRow = Record<string, unknown>;

const CSV_ALIASES = {
  codigo: ["codigo", "cod", "code"],
  nombre: ["nombre", "name"],
  categoria: ["categoria", "category"],
  unidad: ["unidad", "unit"],
  costo_unitario: ["costo_unitario", "costo", "precio", "price"],
  supplier_ref: ["supplier_id", "proveedor_id", "proveedor", "supplier"],
  marca: ["marca", "brand"],
  espesor_mm: ["espesor_mm", "espesor"],
  largo_mm: ["largo_mm", "largo", "length_mm", "length"],
  ancho_mm: ["ancho_mm", "ancho", "width_mm", "width"],
  tiene_veta: ["tiene_veta", "veta", "grain_required"],
  activo: ["activo", "active"],
  favorito: ["favorito", "favorite"],
  observaciones: ["observaciones", "observacion", "notes", "nota"],
};

function normalizeCsvKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/-+/g, "_");
}

function normalizeCsvRow(row: CsvRawRow) {
  const entries = Object.entries(row).map(([key, value]) => [normalizeCsvKey(key), value]);
  return Object.fromEntries(entries) as CsvRawRow;
}

function readCsvString(row: CsvRawRow, aliases: string[]) {
  for (const alias of aliases) {
    const rawValue = row[alias];
    if (rawValue === null || rawValue === undefined) {
      continue;
    }

    const value = String(rawValue).trim();
    if (value) {
      return value;
    }
  }

  return "";
}

function parseCsvNumber(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const compact = normalized.replace(/\s/g, "");
  const canonical =
    compact.includes(",") && compact.includes(".")
      ? compact.replace(/\./g, "").replace(",", ".")
      : compact.replace(",", ".");

  const parsed = Number(canonical);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCsvBoolean(value: string, fallback = false) {
  if (!value.trim()) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "si", "sí", "yes", "y", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "n", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function mapMaterialPayload(input: MaterialFormInput) {
  return {
    codigo: input.codigo.trim(),
    nombre: input.nombre.trim(),
    categoria: normalizeMaterialCategory(input.categoria),
    unidad: normalizeMaterialUnit(input.unidad),
    costo_unitario: Number(input.costo_unitario ?? 0),
    supplier_id: input.supplier_id.trim() || null,
    marca: input.marca.trim() || null,
    espesor_mm: input.espesor_mm ?? null,
    largo_mm: input.largo_mm ?? null,
    ancho_mm: input.ancho_mm ?? null,
    tiene_veta: input.tiene_veta,
    activo: input.activo,
    favorito: input.favorito,
    observaciones: input.observaciones.trim() || null,
  };
}

export async function listMaterialsRecords(filters: Partial<MaterialsQueryInput> = {}) {
  return materialsService.list({
    search: filters.search,
    categoria: filters.categoria,
    unidad: filters.unidad,
    supplier_id: filters.supplier_id,
    estado: filters.estado ?? "all",
    include_deleted: filters.include_deleted ?? false,
  });
}

export async function listMaterialSuppliers() {
  const rows = await suppliersService.list();
  return rows
    .filter((supplier) => !supplier.deleted_at)
    .map((supplier) => ({ id: supplier.id, nombre: supplier.nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export async function getMaterialDetailRecord(materialId: string) {
  return materialsService.getDetail(materialId);
}

export async function createMaterialRecord(input: MaterialFormInput) {
  return materialsService.create(mapMaterialPayload(input), {
    change_reason: "Alta de material",
  });
}

export async function updateMaterialRecord(materialId: string, input: MaterialFormInput) {
  return materialsService.update(materialId, mapMaterialPayload(input), {
    change_reason: "Actualizacion manual",
  });
}

export async function archiveMaterialRecord(materialId: string) {
  await materialsService.softDelete(materialId);
}

export async function restoreMaterialRecord(materialId: string) {
  await materialsService.restore(materialId);
}

export async function toggleMaterialActiveRecord(materialId: string, active: boolean) {
  await materialsService.setActive(materialId, active);
}

export async function importMaterialsCsvRecords(rawRows: CsvRawRow[]) {
  const parsedRows: MaterialCsvInput[] = [];
  const validationErrors: string[] = [];

  for (let index = 0; index < rawRows.length; index += 1) {
    const row = normalizeCsvRow(rawRows[index]);

    const parsed = MaterialCsvInputSchema.safeParse({
      codigo: readCsvString(row, CSV_ALIASES.codigo),
      nombre: readCsvString(row, CSV_ALIASES.nombre),
      categoria: normalizeMaterialCategory(readCsvString(row, CSV_ALIASES.categoria)),
      unidad: normalizeMaterialUnit(readCsvString(row, CSV_ALIASES.unidad)),
      costo_unitario: parseCsvNumber(readCsvString(row, CSV_ALIASES.costo_unitario)) ?? 0,
      supplier_ref: readCsvString(row, CSV_ALIASES.supplier_ref) || undefined,
      marca: readCsvString(row, CSV_ALIASES.marca) || undefined,
      espesor_mm: parseCsvNumber(readCsvString(row, CSV_ALIASES.espesor_mm)),
      largo_mm: parseCsvNumber(readCsvString(row, CSV_ALIASES.largo_mm)),
      ancho_mm: parseCsvNumber(readCsvString(row, CSV_ALIASES.ancho_mm)),
      tiene_veta: parseCsvBoolean(readCsvString(row, CSV_ALIASES.tiene_veta)),
      activo: parseCsvBoolean(readCsvString(row, CSV_ALIASES.activo), true),
      favorito: parseCsvBoolean(readCsvString(row, CSV_ALIASES.favorito), false),
      observaciones: readCsvString(row, CSV_ALIASES.observaciones) || undefined,
    });

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      validationErrors.push(`Fila ${index + 2}: ${issue?.message || "Dato invalido."}`);
      continue;
    }

    parsedRows.push(parsed.data);
  }

  if (validationErrors.length > 0) {
    throw new Error(validationErrors.slice(0, 5).join(" | "));
  }

  return materialsService.importFromCsv(parsedRows);
}
