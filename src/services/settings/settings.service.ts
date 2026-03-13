import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { calculateWorkshopHourCost } from "@/domain/costing/settings";
import type { Database, TableInsert, TableRow, TableUpdate } from "@/types";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/services/supabase/browser-client";

const SETTINGS_TABLE = "settings" as const;

type QueryResponse<T> = {
  data: T | null;
  error: PostgrestError | null;
};

interface AuthorizedContext {
  client: SupabaseClient<Database>;
  userId: string;
}

interface SettingsNotesData {
  manualEnabled: boolean;
  manualValue: number | null;
  plainNotes: string | null;
}

export type SettingsRow = TableRow<typeof SETTINGS_TABLE>;
export type SettingsInsert = TableInsert<typeof SETTINGS_TABLE>;
export type SettingsUpdate = TableUpdate<typeof SETTINGS_TABLE>;

export interface SettingsRecord extends SettingsRow {
  costo_hora_taller_auto: number;
  usar_costo_hora_taller_manual: boolean;
  costo_hora_taller_manual: number | null;
}

export interface SettingsMutationInput {
  horas_productivas_mes: number;
  costos_fijos_mes: number;
  costo_hora_taller: number;
  usar_costo_hora_taller_manual: boolean;
  costo_hora_taller_manual: number | null;
  desperdicio_melamina_pct: number;
  margen_medida_pct: number;
  margen_ecommerce_pct: number;
  impuestos_pct: number;
  publicidad_pct: number;
  comision_cobro_pct: number;
  embalaje_promedio: number;
  envio_promedio: number;
  kerf_sierra_mm: number;
  margen_perimetral_placa_mm: number;
  permitir_rotacion_por_defecto: boolean;
  veta_obligatoria_por_defecto: boolean;
}

const DEFAULT_SETTINGS_VALUES: SettingsMutationInput = {
  horas_productivas_mes: 176,
  costos_fijos_mes: 0,
  costo_hora_taller: 0,
  usar_costo_hora_taller_manual: false,
  costo_hora_taller_manual: null,
  desperdicio_melamina_pct: 0,
  margen_medida_pct: 30,
  margen_ecommerce_pct: 25,
  impuestos_pct: 0,
  publicidad_pct: 0,
  comision_cobro_pct: 0,
  embalaje_promedio: 0,
  envio_promedio: 0,
  kerf_sierra_mm: 3,
  margen_perimetral_placa_mm: 10,
  permitir_rotacion_por_defecto: true,
  veta_obligatoria_por_defecto: false,
};

function normalizeString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeNonNegative(value: number | null | undefined, fallback = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  if (value < 0) {
    return 0;
  }

  return value;
}

function parseSettingsNotes(notes: string | null): SettingsNotesData {
  const normalized = normalizeString(notes);
  if (!normalized) {
    return {
      manualEnabled: false,
      manualValue: null,
      plainNotes: null,
    };
  }

  try {
    const parsed = JSON.parse(normalized) as {
      manual_cost_hour_enabled?: unknown;
      manual_cost_hour_value?: unknown;
      plain_notes?: unknown;
    };

    const manualValue =
      typeof parsed.manual_cost_hour_value === "number" &&
      Number.isFinite(parsed.manual_cost_hour_value)
        ? parsed.manual_cost_hour_value
        : null;

    return {
      manualEnabled: Boolean(parsed.manual_cost_hour_enabled) && manualValue !== null,
      manualValue,
      plainNotes: typeof parsed.plain_notes === "string" ? normalizeString(parsed.plain_notes) : null,
    };
  } catch {
    return {
      manualEnabled: false,
      manualValue: null,
      plainNotes: normalized,
    };
  }
}

function serializeSettingsNotes(data: SettingsNotesData) {
  if (!data.manualEnabled && data.manualValue === null) {
    return data.plainNotes;
  }

  return JSON.stringify({
    manual_cost_hour_enabled: data.manualEnabled,
    manual_cost_hour_value: data.manualValue,
    plain_notes: data.plainNotes,
  });
}

function mapSettingsRecord(row: SettingsRow): SettingsRecord {
  const notesData = parseSettingsNotes(row.notes);
  const autoCost = calculateWorkshopHourCost(row.costos_fijos_mes, row.horas_productivas_mes);
  const effectiveCost =
    notesData.manualEnabled && notesData.manualValue !== null ? notesData.manualValue : autoCost;

  return {
    ...row,
    costo_hora_taller: effectiveCost,
    costo_hora_taller_auto: autoCost,
    usar_costo_hora_taller_manual: notesData.manualEnabled,
    costo_hora_taller_manual: notesData.manualEnabled ? notesData.manualValue : null,
  };
}

function buildSettingsPayload(
  context: AuthorizedContext,
  input: SettingsMutationInput,
  currentRow: SettingsRow | null,
) {
  const horasProductivasMes = normalizeNonNegative(
    input.horas_productivas_mes,
    DEFAULT_SETTINGS_VALUES.horas_productivas_mes,
  );
  const costosFijosMes = normalizeNonNegative(
    input.costos_fijos_mes,
    DEFAULT_SETTINGS_VALUES.costos_fijos_mes,
  );
  const costoHoraAuto = calculateWorkshopHourCost(costosFijosMes, horasProductivasMes);

  const manualEnabled = Boolean(input.usar_costo_hora_taller_manual);
  const manualValue = manualEnabled
    ? normalizeNonNegative(
        input.costo_hora_taller_manual ?? input.costo_hora_taller,
        input.costo_hora_taller ?? costoHoraAuto,
      )
    : null;

  const previousNotes = parseSettingsNotes(currentRow?.notes ?? null);

  const payload: SettingsUpdate = {
    profile_id: context.userId,
    horas_productivas_mes: horasProductivasMes,
    costos_fijos_mes: costosFijosMes,
    costo_hora_taller:
      manualEnabled && manualValue !== null ? manualValue : normalizeNonNegative(costoHoraAuto),
    desperdicio_melamina_pct: normalizeNonNegative(input.desperdicio_melamina_pct),
    margen_medida_pct: normalizeNonNegative(input.margen_medida_pct),
    margen_ecommerce_pct: normalizeNonNegative(input.margen_ecommerce_pct),
    impuestos_pct: normalizeNonNegative(input.impuestos_pct),
    publicidad_pct: normalizeNonNegative(input.publicidad_pct),
    comision_cobro_pct: normalizeNonNegative(input.comision_cobro_pct),
    embalaje_promedio: normalizeNonNegative(input.embalaje_promedio),
    envio_promedio: normalizeNonNegative(input.envio_promedio),
    kerf_sierra_mm: normalizeNonNegative(input.kerf_sierra_mm),
    margen_perimetral_placa_mm: normalizeNonNegative(input.margen_perimetral_placa_mm),
    permitir_rotacion_por_defecto: Boolean(input.permitir_rotacion_por_defecto),
    veta_obligatoria_por_defecto: Boolean(input.veta_obligatoria_por_defecto),
    is_active: true,
    notes: serializeSettingsNotes({
      manualEnabled,
      manualValue: manualEnabled ? manualValue : null,
      plainNotes: previousNotes.plainNotes,
    }),
    updated_by: context.userId,
    deleted_at: null,
    deleted_by: null,
  };

  return payload;
}

async function getAuthorizedContext(): Promise<AuthorizedContext> {
  if (!hasSupabaseConfig()) {
    throw new Error("Falta configurar Supabase en variables de entorno.");
  }

  const client = getSupabaseBrowserClient();
  if (!client) {
    throw new Error("No se pudo inicializar el cliente de Supabase.");
  }

  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    throw new Error("Sesion no valida. Inicia sesion nuevamente.");
  }

  return { client, userId: user.id };
}

async function fetchActiveSettingsRow(context: AuthorizedContext): Promise<SettingsRow | null> {
  const response = (await context.client
    .from(SETTINGS_TABLE as never)
    .select("*")
    .eq("profile_id", context.userId)
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(1)) as QueryResponse<SettingsRow[]>;

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data?.[0] ?? null;
}

async function createDefaultSettings(context: AuthorizedContext): Promise<SettingsRow> {
  const payload = buildSettingsPayload(context, DEFAULT_SETTINGS_VALUES, null) as SettingsInsert;
  payload.created_by = context.userId;

  const response = (await context.client
    .from(SETTINGS_TABLE as never)
    .insert(payload as never)
    .select("*")
    .single()) as QueryResponse<SettingsRow>;

  if (response.error || !response.data) {
    throw new Error(response.error?.message || "No se pudo crear la configuracion inicial.");
  }

  return response.data;
}

export const settingsService = {
  async getCurrent(): Promise<SettingsRecord> {
    const context = await getAuthorizedContext();
    const row = (await fetchActiveSettingsRow(context)) ?? (await createDefaultSettings(context));
    return mapSettingsRecord(row);
  },

  async saveCurrent(input: SettingsMutationInput): Promise<SettingsRecord> {
    const context = await getAuthorizedContext();
    const currentRow = await fetchActiveSettingsRow(context);
    const payload = buildSettingsPayload(context, input, currentRow);

    const response = currentRow
      ? ((await context.client
          .from(SETTINGS_TABLE as never)
          .update(payload as never)
          .eq("id", currentRow.id)
          .eq("profile_id", context.userId)
          .select("*")
          .single()) as QueryResponse<SettingsRow>)
      : ((await context.client
          .from(SETTINGS_TABLE as never)
          .insert(
            {
              ...(payload as SettingsInsert),
              created_by: context.userId,
            } as never,
          )
          .select("*")
          .single()) as QueryResponse<SettingsRow>);

    if (response.error || !response.data) {
      throw new Error(response.error?.message || "No se pudo guardar la configuracion.");
    }

    return mapSettingsRecord(response.data);
  },
};
