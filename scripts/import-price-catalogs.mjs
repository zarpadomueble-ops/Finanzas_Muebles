import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import Papa from "papaparse";
import { createClient } from "@supabase/supabase-js";

const REQUIRED_HEADERS = ["nombre", "descripcion", "color", "precio"];
const DEFAULT_EFFECTIVE_DATE = new Date().toISOString().slice(0, 10);
const DEFAULT_SOURCES = [
  {
    filePath: "C:\\Users\\Asael\\Downloads\\placas_mech_faplac_import.csv",
    supplierName: "Faplac",
    listName: "Placas Mech Faplac",
  },
  {
    filePath: "C:\\Users\\Asael\\Downloads\\herrajes_grupoeuro_mech_import.csv",
    supplierName: "Grupo Euro",
    listName: "Herrajes Grupo Euro",
  },
];

function parseArgs(argv) {
  const options = {
    mode: "dry-run",
    files: [],
    profileId: null,
    effectiveDate: DEFAULT_EFFECTIVE_DATE,
    reportOut: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--apply") {
      options.mode = "apply";
      continue;
    }

    if (arg === "--dry-run") {
      options.mode = "dry-run";
      continue;
    }

    if (arg === "--profile-id") {
      options.profileId = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--effective-date") {
      options.effectiveDate = argv[index + 1] ?? DEFAULT_EFFECTIVE_DATE;
      index += 1;
      continue;
    }

    if (arg === "--report-out") {
      options.reportOut = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === "--files") {
      while (argv[index + 1] && !argv[index + 1].startsWith("--")) {
        options.files.push(argv[index + 1]);
        index += 1;
      }
    }
  }

  return options;
}

async function readEnvFile(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const entries = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        return separator === -1
          ? null
          : [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
      })
      .filter(Boolean);

    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

function normalizeSpaces(value) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeNullableText(value) {
  const normalized = normalizeSpaces(value);
  return normalized ? normalized : null;
}

function normalizePrice(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >= 0 ? value : null;
  }

  const normalized = normalizeSpaces(value);
  if (!normalized) {
    return null;
  }

  let candidate = normalized;
  const lastComma = candidate.lastIndexOf(",");
  const lastDot = candidate.lastIndexOf(".");

  if (lastComma !== -1 && lastDot === -1) {
    candidate = candidate.replace(",", ".");
  } else if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      candidate = candidate.replace(/\./g, "").replace(",", ".");
    } else {
      candidate = candidate.replace(/,/g, "");
    }
  }

  const parsed = Number(candidate);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

function slugifyPart(value) {
  const normalized = normalizeSpaces(value)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  return normalized;
}

function buildUniqueSlugKey(nombre, descripcion, color) {
  const slugNombre = slugifyPart(nombre);
  const slugDescripcion = slugifyPart(descripcion);
  const slugColor = slugifyPart(color ?? "");

  return {
    slugNombre,
    slugDescripcion,
    slugColor,
    uniqueSlugKey: `${slugNombre}__${slugDescripcion}__${slugColor}`,
  };
}

function detectSourceConfig(filePath) {
  const normalizedBaseName = path.basename(filePath).toLowerCase();
  return (
    DEFAULT_SOURCES.find((source) => path.basename(source.filePath).toLowerCase() === normalizedBaseName) ?? {
      filePath,
      supplierName: path.basename(filePath, path.extname(filePath)),
      listName: path.basename(filePath, path.extname(filePath)),
    }
  );
}

function validateHeaders(headers) {
  const normalizedHeaders = headers.map((header) => normalizeSpaces(header).toLowerCase());
  const exactMatch =
    normalizedHeaders.length === REQUIRED_HEADERS.length &&
    normalizedHeaders.every((header, index) => header === REQUIRED_HEADERS[index]);

  return {
    normalizedHeaders,
    exactMatch,
  };
}

async function parseCsvFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const csvText = raw.replace(/^\uFEFF/, "");

  const result = Papa.parse(csvText, {
    header: true,
    delimiter: ",",
    skipEmptyLines: "greedy",
  });

  if (result.errors.length > 0) {
    throw new Error(`${path.basename(filePath)}: ${result.errors[0].message}`);
  }

  const headers = Array.isArray(result.meta.fields) ? result.meta.fields : [];
  return {
    headers,
    rows: result.data,
    checksum: crypto.createHash("sha256").update(csvText).digest("hex"),
  };
}

function normalizeRow(rawRow, rowNumber) {
  const nombre = normalizeSpaces(rawRow.nombre);
  const descripcion = normalizeSpaces(rawRow.descripcion);
  const color = normalizeNullableText(rawRow.color);
  const precio = normalizePrice(rawRow.precio);
  const errors = [];

  if (!nombre) {
    errors.push("nombre vacio");
  }

  if (!descripcion) {
    errors.push("descripcion vacia");
  }

  if (precio === null) {
    errors.push("precio invalido");
  }

  const slugParts = buildUniqueSlugKey(nombre, descripcion, color ?? "");
  if (!slugParts.slugNombre || !slugParts.slugDescripcion) {
    errors.push("slug incompleto");
  }

  return {
    rowNumber,
    rawRow,
    normalizedRow: {
      nombre,
      descripcion,
      color,
      precio,
      slug_nombre: slugParts.slugNombre,
      slug_descripcion: slugParts.slugDescripcion,
      slug_color: slugParts.slugColor,
      unique_slug_key: slugParts.uniqueSlugKey,
    },
    errors,
  };
}

function processRows(filePath, rows) {
  const seenKeys = new Set();
  const validRows = [];
  const duplicates = [];
  const errors = [];

  rows.forEach((rawRow, index) => {
    const normalized = normalizeRow(rawRow, index + 2);

    if (normalized.errors.length > 0) {
      errors.push({
        rowNumber: normalized.rowNumber,
        errors: normalized.errors,
        rawRow: normalized.rawRow,
      });
      return;
    }

    if (seenKeys.has(normalized.normalizedRow.unique_slug_key)) {
      duplicates.push({
        rowNumber: normalized.rowNumber,
        reason: "duplicado_en_archivo",
        uniqueSlugKey: normalized.normalizedRow.unique_slug_key,
      });
      return;
    }

    seenKeys.add(normalized.normalizedRow.unique_slug_key);
    validRows.push(normalized.normalizedRow);
  });

  return {
    filePath,
    totalRows: rows.length,
    validRows,
    duplicates,
    errors,
  };
}

function chunkArray(values, size = 200) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function ensureSupplier(client, profileId, supplierName) {
  const existingResponse = await client
    .from("suppliers")
    .select("id, nombre")
    .eq("profile_id", profileId)
    .eq("nombre", supplierName)
    .is("deleted_at", null)
    .limit(1)
    .maybeSingle();

  if (existingResponse.error) {
    throw new Error(existingResponse.error.message);
  }

  if (existingResponse.data) {
    return existingResponse.data;
  }

  const insertResponse = await client
    .from("suppliers")
    .insert({
      profile_id: profileId,
      nombre: supplierName,
      telefono: null,
      email: null,
      ciudad: null,
      codigo: null,
      contacto: null,
      cuit: null,
      condicion_iva: null,
      observaciones: "Proveedor creado por script de importacion CSV",
      is_primary: false,
      created_by: profileId,
      updated_by: profileId,
    })
    .select("id, nombre")
    .single();

  if (insertResponse.error || !insertResponse.data) {
    throw new Error(insertResponse.error?.message || `No se pudo crear el proveedor ${supplierName}.`);
  }

  return insertResponse.data;
}

async function createPriceList(client, profileId, supplierId, source, checksum, effectiveDate) {
  const response = await client
    .from("material_price_lists")
    .insert({
      profile_id: profileId,
      supplier_id: supplierId,
      name: source.listName,
      source_filename: path.basename(source.filePath),
      checksum,
      effective_date: effectiveDate,
      currency: "ARS",
      status: "draft",
      notes: `Importado desde ${path.basename(source.filePath)}`,
      created_by: profileId,
      updated_by: profileId,
    })
    .select("*")
    .single();

  if (response.error || !response.data) {
    throw new Error(response.error?.message || "No se pudo crear la cabecera de lista de precios.");
  }

  return response.data;
}

async function createImportRun(client, profileId, supplierId, priceListId, source, effectiveDate, totalRows) {
  const response = await client
    .from("material_price_imports")
    .insert({
      profile_id: profileId,
      price_list_id: priceListId,
      supplier_id: supplierId,
      strategy: "update_matched_only",
      column_mapping: {
        nombre: "nombre",
        descripcion: "descripcion",
        color: "color",
        precio: "precio",
      },
      detected_columns: REQUIRED_HEADERS,
      summary_total_rows: totalRows,
      summary_inserted: 0,
      summary_updated: 0,
      summary_ignored: 0,
      summary_failed: 0,
      imported_by: profileId,
      status: "running",
      source_filename: path.basename(source.filePath),
      effective_date: effectiveDate,
      created_by: profileId,
      updated_by: profileId,
    })
    .select("*")
    .single();

  if (response.error || !response.data) {
    throw new Error(response.error?.message || "No se pudo crear la corrida de importacion.");
  }

  return response.data;
}

async function fetchExistingCatalogItems(client, profileId, uniqueKeys) {
  const results = new Map();

  for (const keysChunk of chunkArray(uniqueKeys)) {
    const response = await client
      .from("material_price_catalog_items")
      .select("*")
      .eq("profile_id", profileId)
      .in("unique_slug_key", keysChunk)
      .is("deleted_at", null);

    if (response.error) {
      throw new Error(response.error.message);
    }

    for (const row of response.data ?? []) {
      results.set(row.unique_slug_key, row);
    }
  }

  return results;
}

function buildCatalogPayload(profileId, supplierId, priceListId, importRunId, effectiveDate, sourceFileName, row) {
  return {
    profile_id: profileId,
    supplier_id: supplierId,
    latest_price_list_id: priceListId,
    latest_import_id: importRunId,
    source_filename: sourceFileName,
    nombre: row.nombre,
    descripcion: row.descripcion,
    color: row.color,
    precio: row.precio,
    currency: "ARS",
    slug_nombre: row.slug_nombre,
    slug_descripcion: row.slug_descripcion,
    slug_color: row.slug_color,
    unique_slug_key: row.unique_slug_key,
    raw_payload: row,
    is_active: true,
    record_date: effectiveDate,
    created_by: profileId,
    updated_by: profileId,
  };
}

async function applyFileImport(client, profileId, source, parsedFile, processedFile, effectiveDate) {
  const supplier = await ensureSupplier(client, profileId, source.supplierName);
  const priceList = await createPriceList(
    client,
    profileId,
    supplier.id,
    source,
    parsedFile.checksum,
    effectiveDate,
  );
  const importRun = await createImportRun(
    client,
    profileId,
    supplier.id,
    priceList.id,
    source,
    effectiveDate,
    processedFile.totalRows,
  );

  const existingMap = await fetchExistingCatalogItems(
    client,
    profileId,
    processedFile.validRows.map((row) => row.unique_slug_key),
  );

  const rowLogs = [];
  const upserts = [];
  let created = 0;
  let updated = 0;
  let duplicates = processedFile.duplicates.length;

  for (const row of processedFile.validRows) {
    const existing = existingMap.get(row.unique_slug_key);
    const payload = buildCatalogPayload(
      profileId,
      supplier.id,
      priceList.id,
      importRun.id,
      effectiveDate,
      path.basename(source.filePath),
      row,
    );

    if (!existing) {
      created += 1;
      upserts.push(payload);
      rowLogs.push({
        action: "created",
        match_type: "none",
        matched_material_id: null,
        raw_row: row,
        normalized_row: row,
        validation_errors: [],
        previous_material_snapshot: null,
        result_material_snapshot: payload,
      });
      continue;
    }

    const noChanges =
      existing.nombre === payload.nombre &&
      existing.descripcion === payload.descripcion &&
      (existing.color ?? null) === payload.color &&
      Number(existing.precio) === payload.precio &&
      existing.supplier_id === supplier.id;

    if (noChanges) {
      duplicates += 1;
      rowLogs.push({
        action: "ignored",
        match_type: "none",
        matched_material_id: null,
        raw_row: row,
        normalized_row: row,
        validation_errors: [],
        previous_material_snapshot: existing,
        result_material_snapshot: existing,
      });
      continue;
    }

    updated += 1;
    upserts.push({
      ...payload,
      id: existing.id,
      created_at: existing.created_at,
      created_by: existing.created_by,
    });
    rowLogs.push({
      action: "updated",
      match_type: "none",
      matched_material_id: null,
      raw_row: row,
      normalized_row: row,
      validation_errors: [],
      previous_material_snapshot: existing,
      result_material_snapshot: payload,
    });
  }

  if (upserts.length > 0) {
    for (const chunk of chunkArray(upserts, 200)) {
      const response = await client
        .from("material_price_catalog_items")
        .upsert(chunk, { onConflict: "profile_id,unique_slug_key" });

      if (response.error) {
        throw new Error(response.error.message);
      }
    }
  }

  const errorRowLogs = processedFile.errors.map((error) => ({
    action: "failed",
    match_type: "none",
    matched_material_id: null,
    raw_row: error.rawRow,
    normalized_row: {},
    validation_errors: error.errors,
    previous_material_snapshot: null,
    result_material_snapshot: null,
  }));

  const allRowLogs = [...rowLogs, ...errorRowLogs];
  if (allRowLogs.length > 0) {
    for (const chunk of chunkArray(allRowLogs, 200)) {
      const response = await client.from("material_price_import_rows").insert(
        chunk.map((rowLog, index) => ({
          profile_id: profileId,
          import_id: importRun.id,
          row_number: index + 1,
          ...rowLog,
          created_by: profileId,
          updated_by: profileId,
        })),
      );

      if (response.error) {
        throw new Error(response.error.message);
      }
    }
  }

  const finalSummary = {
    imported: created + updated,
    created,
    updated,
    duplicated: duplicates,
    errors: processedFile.errors.length,
  };

  const finalizeImportResponse = await client
    .from("material_price_imports")
    .update({
      summary_inserted: created,
      summary_updated: updated,
      summary_ignored: duplicates,
      summary_failed: processedFile.errors.length,
      finished_at: new Date().toISOString(),
      status: processedFile.errors.length > 0 ? "failed" : "completed",
      updated_by: profileId,
    })
    .eq("id", importRun.id);

  if (finalizeImportResponse.error) {
    throw new Error(finalizeImportResponse.error.message);
  }

  const finalizeListResponse = await client
    .from("material_price_lists")
    .update({
      status: processedFile.errors.length > 0 ? "previewed" : "imported",
      updated_by: profileId,
    })
    .eq("id", priceList.id);

  if (finalizeListResponse.error) {
    throw new Error(finalizeListResponse.error.message);
  }

  return {
    supplier,
    priceList,
    importRun,
    summary: finalSummary,
  };
}

function buildConsoleLog(report) {
  const lines = [];

  lines.push(`Modo: ${report.mode}`);
  lines.push(`Archivos procesados: ${report.files.length}`);
  lines.push("");

  for (const file of report.files) {
    lines.push(`[${path.basename(file.filePath)}]`);
    lines.push(`- proveedor: ${file.supplierName}`);
    lines.push(`- filas totales: ${file.totalRows}`);
    lines.push(`- importados: ${file.summary.imported}`);
    lines.push(`- creados: ${file.summary.created}`);
    lines.push(`- actualizados: ${file.summary.updated}`);
    lines.push(`- duplicados: ${file.summary.duplicated}`);
    lines.push(`- errores: ${file.summary.errors}`);

    if (file.errors.length > 0) {
      lines.push(`- primeras filas con error: ${file.errors.slice(0, 5).map((item) => `${item.rowNumber}`).join(", ")}`);
    }

    if (file.duplicates.length > 0) {
      lines.push(`- primeras filas duplicadas: ${file.duplicates.slice(0, 5).map((item) => `${item.rowNumber}`).join(", ")}`);
    }

    lines.push("");
  }

  lines.push("[Resumen global]");
  lines.push(`- importados: ${report.summary.imported}`);
  lines.push(`- creados: ${report.summary.created}`);
  lines.push(`- actualizados: ${report.summary.updated}`);
  lines.push(`- duplicados: ${report.summary.duplicated}`);
  lines.push(`- errores: ${report.summary.errors}`);

  return lines.join("\n");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const envFromFile = await readEnvFile(path.resolve(process.cwd(), ".env.local"));
  const profileId = options.profileId ?? process.env.IMPORT_PROFILE_ID ?? null;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? envFromFile.NEXT_PUBLIC_SUPABASE_URL ?? null;

  const sources =
    options.files.length > 0
      ? options.files.map((filePath) => ({
          ...detectSourceConfig(filePath),
          filePath,
        }))
      : DEFAULT_SOURCES;

  const parsedSources = [];
  for (const source of sources) {
    const parsedFile = await parseCsvFile(source.filePath);
    const headerValidation = validateHeaders(parsedFile.headers);
    if (!headerValidation.exactMatch) {
      throw new Error(
        `${path.basename(source.filePath)}: encabezados invalidos. Esperado: ${REQUIRED_HEADERS.join(", ")}. Recibido: ${headerValidation.normalizedHeaders.join(", ")}`,
      );
    }

    const processedFile = processRows(source.filePath, parsedFile.rows);
    parsedSources.push({
      source,
      parsedFile,
      processedFile,
    });
  }

  const report = {
    mode: options.mode,
    generatedAt: new Date().toISOString(),
    effectiveDate: options.effectiveDate,
    files: [],
    summary: {
      imported: 0,
      created: 0,
      updated: 0,
      duplicated: 0,
      errors: 0,
    },
  };

  if (options.mode === "apply") {
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error(
        "Para --apply necesitas NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en el entorno.",
      );
    }

    if (!profileId) {
      throw new Error("Para --apply necesitas --profile-id o IMPORT_PROFILE_ID.");
    }

    const client = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    for (const item of parsedSources) {
      const applied = await applyFileImport(
        client,
        profileId,
        item.source,
        item.parsedFile,
        item.processedFile,
        options.effectiveDate,
      );

      report.files.push({
        filePath: item.source.filePath,
        supplierName: item.source.supplierName,
        totalRows: item.processedFile.totalRows,
        duplicates: item.processedFile.duplicates,
        errors: item.processedFile.errors,
        summary: applied.summary,
        priceListId: applied.priceList.id,
        importId: applied.importRun.id,
      });
    }
  } else {
    for (const item of parsedSources) {
      report.files.push({
        filePath: item.source.filePath,
        supplierName: item.source.supplierName,
        totalRows: item.processedFile.totalRows,
        duplicates: item.processedFile.duplicates,
        errors: item.processedFile.errors,
        summary: {
          imported: item.processedFile.validRows.length,
          created: item.processedFile.validRows.length,
          updated: 0,
          duplicated: item.processedFile.duplicates.length,
          errors: item.processedFile.errors.length,
        },
      });
    }
  }

  for (const file of report.files) {
    report.summary.imported += file.summary.imported;
    report.summary.created += file.summary.created;
    report.summary.updated += file.summary.updated;
    report.summary.duplicated += file.summary.duplicated;
    report.summary.errors += file.summary.errors;
  }

  const consoleLog = buildConsoleLog(report);
  console.log(consoleLog);

  if (options.reportOut) {
    await fs.mkdir(path.dirname(options.reportOut), { recursive: true });
    await fs.writeFile(options.reportOut, JSON.stringify(report, null, 2), "utf8");
    console.log(`\nReporte guardado en ${options.reportOut}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
