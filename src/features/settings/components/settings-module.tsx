"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { RefreshCw, Save } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { getCurrentSettingsRecord, saveCurrentSettingsRecord } from "@/features/settings/actions";
import { SettingsFormSchema, type SettingsFormInput } from "@/features/settings/schemas";
import type { SettingsRecord } from "@/features/settings/types";
import { calculateWorkshopHourCost } from "@/domain/costing/settings";
import { ErrorState, LoadingState, SaveIndicator } from "@/components/feedback";
import { FormFieldWrapper } from "@/components/forms";
import { PageHeader, SectionCard } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatCurrency, formatDate, formatPercent } from "@/lib/utils";

const DEFAULT_FORM_VALUES: SettingsFormInput = {
  horas_productivas_mes: 176,
  costos_fijos_mes: 0,
  costo_hora_taller: 0,
  usar_costo_hora_taller_manual: false,
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

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrio un error inesperado.";
}

function mapRecordToFormValues(record: SettingsRecord): SettingsFormInput {
  const manualEnabled = record.usar_costo_hora_taller_manual;
  const effectiveCost =
    manualEnabled && record.costo_hora_taller_manual !== null
      ? record.costo_hora_taller_manual
      : record.costo_hora_taller_auto;

  return {
    horas_productivas_mes: Number(record.horas_productivas_mes || 0),
    costos_fijos_mes: Number(record.costos_fijos_mes || 0),
    costo_hora_taller: Number(effectiveCost || 0),
    usar_costo_hora_taller_manual: manualEnabled,
    desperdicio_melamina_pct: Number(record.desperdicio_melamina_pct || 0),
    margen_medida_pct: Number(record.margen_medida_pct || 0),
    margen_ecommerce_pct: Number(record.margen_ecommerce_pct || 0),
    impuestos_pct: Number(record.impuestos_pct || 0),
    publicidad_pct: Number(record.publicidad_pct || 0),
    comision_cobro_pct: Number(record.comision_cobro_pct || 0),
    embalaje_promedio: Number(record.embalaje_promedio || 0),
    envio_promedio: Number(record.envio_promedio || 0),
    kerf_sierra_mm: Number(record.kerf_sierra_mm || 0),
    margen_perimetral_placa_mm: Number(record.margen_perimetral_placa_mm || 0),
    permitir_rotacion_por_defecto: Boolean(record.permitir_rotacion_por_defecto),
    veta_obligatoria_por_defecto: Boolean(record.veta_obligatoria_por_defecto),
  };
}

export function SettingsModule() {
  const [settings, setSettings] = useState<SettingsRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(
    null,
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const form = useForm<SettingsFormInput>({
    resolver: zodResolver(SettingsFormSchema),
    defaultValues: DEFAULT_FORM_VALUES,
    mode: "onChange",
  });

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const record = await getCurrentSettingsRecord();
      setSettings(record);
      form.reset(mapRecordToFormValues(record));
      setSaveState("idle");
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setIsLoading(false);
    }
  }, [form]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const horasProductivasMes = form.watch("horas_productivas_mes");
  const costosFijosMes = form.watch("costos_fijos_mes");
  const costoHoraManualEnabled = form.watch("usar_costo_hora_taller_manual");

  const costoHoraAuto = useMemo(
    () => calculateWorkshopHourCost(costosFijosMes, horasProductivasMes),
    [costosFijosMes, horasProductivasMes],
  );

  useEffect(() => {
    if (!costoHoraManualEnabled) {
      form.setValue("costo_hora_taller", costoHoraAuto, {
        shouldDirty: false,
        shouldValidate: true,
      });
    }
  }, [costoHoraAuto, costoHoraManualEnabled, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setIsSaving(true);
    setSaveState("saving");
    setFeedback(null);

    try {
      const saved = await saveCurrentSettingsRecord(values);
      setSettings(saved);
      form.reset(mapRecordToFormValues(saved));
      setSaveState("saved");
      setFeedback({ type: "success", message: "Parametros guardados correctamente." });
    } catch (saveError) {
      setSaveState("error");
      setFeedback({ type: "error", message: getErrorMessage(saveError) });
    } finally {
      setIsSaving(false);
    }
  });

  if (isLoading) {
    return (
      <LoadingState
        title="Cargando parametros globales"
        description="Buscando configuracion activa en Supabase..."
      />
    );
  }

  if (error) {
    return <ErrorState description={error} onRetry={() => void loadSettings()} />;
  }

  const lastUpdatedAt = settings?.updated_at ? formatDate(settings.updated_at) : "-";

  return (
    <div className="space-y-4">
      <PageHeader
        title="Parámetros Globales"
        description={`Fuente central de configuracion para costos, margenes y corte. Ultima actualizacion: ${lastUpdatedAt}.`}
        actions={
          <>
            <SaveIndicator state={saveState} />
            <Button type="button" variant="outline" onClick={() => void loadSettings()} disabled={isSaving}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Recargar
            </Button>
            <Button type="submit" form="settings-form" disabled={isSaving || !form.formState.isValid}>
              <Save className="mr-2 h-4 w-4" />
              {isSaving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </>
        }
      />

      {feedback ? (
        <div
          className={`rounded-lg border px-3 py-2 text-sm ${
            feedback.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <form id="settings-form" className="space-y-4" onSubmit={onSubmit}>
        <SectionCard
          title="Capacidad y Costo de Taller"
          description="Base para calcular mano de obra por hora."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <FormFieldWrapper
              label="Horas productivas por mes"
              required
              error={form.formState.errors.horas_productivas_mes?.message}
            >
              <Input
                type="number"
                min={1}
                step="1"
                {...form.register("horas_productivas_mes", {
                  setValueAs: (value) => (value === "" ? 0 : Number(value)),
                })}
              />
            </FormFieldWrapper>

            <FormFieldWrapper
              label="Costos fijos por mes"
              required
              error={form.formState.errors.costos_fijos_mes?.message}
              description={formatCurrency(costosFijosMes || 0)}
            >
              <Input
                type="number"
                min={0}
                step="0.01"
                {...form.register("costos_fijos_mes", {
                  setValueAs: (value) => (value === "" ? 0 : Number(value)),
                })}
              />
            </FormFieldWrapper>

            <FormFieldWrapper
              label="Costo hora taller"
              required
              error={form.formState.errors.costo_hora_taller?.message}
              description={`Auto: ${formatCurrency(costoHoraAuto)}`}
            >
              <Input
                type="number"
                min={0}
                step="0.01"
                disabled={!costoHoraManualEnabled}
                {...form.register("costo_hora_taller", {
                  setValueAs: (value) => (value === "" ? 0 : Number(value)),
                })}
              />
            </FormFieldWrapper>

            <FormFieldWrapper label="Override manual">
              <div className="flex h-9 items-center">
                <Switch
                  checked={Boolean(costoHoraManualEnabled)}
                  onChange={(event) =>
                    form.setValue("usar_costo_hora_taller_manual", event.currentTarget.checked, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
              </div>
            </FormFieldWrapper>
          </div>
        </SectionCard>

        <SectionCard
          title="Márgenes y Costos Comerciales"
          description="Parámetros para costeo de medida y ecommerce."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <PercentField
              label="Desperdicio melamina"
              field="desperdicio_melamina_pct"
              form={form}
            />
            <PercentField label="Margen medida" field="margen_medida_pct" form={form} />
            <PercentField label="Margen ecommerce" field="margen_ecommerce_pct" form={form} />
            <PercentField label="Impuestos" field="impuestos_pct" form={form} />
            <PercentField label="Publicidad" field="publicidad_pct" form={form} />
            <PercentField label="Comision cobro" field="comision_cobro_pct" form={form} />

            <FormFieldWrapper
              label="Embalaje promedio"
              error={form.formState.errors.embalaje_promedio?.message}
              description={formatCurrency(form.watch("embalaje_promedio") || 0)}
            >
              <Input
                type="number"
                min={0}
                step="0.01"
                {...form.register("embalaje_promedio", {
                  setValueAs: (value) => (value === "" ? 0 : Number(value)),
                })}
              />
            </FormFieldWrapper>

            <FormFieldWrapper
              label="Envio promedio"
              error={form.formState.errors.envio_promedio?.message}
              description={formatCurrency(form.watch("envio_promedio") || 0)}
            >
              <Input
                type="number"
                min={0}
                step="0.01"
                {...form.register("envio_promedio", {
                  setValueAs: (value) => (value === "" ? 0 : Number(value)),
                })}
              />
            </FormFieldWrapper>
          </div>
        </SectionCard>

        <SectionCard
          title="Producción y Corte"
          description="Parámetros por defecto para optimización de placas."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <FormFieldWrapper
              label="Kerf sierra (mm)"
              error={form.formState.errors.kerf_sierra_mm?.message}
            >
              <Input
                type="number"
                min={0}
                step="0.1"
                {...form.register("kerf_sierra_mm", {
                  setValueAs: (value) => (value === "" ? 0 : Number(value)),
                })}
              />
            </FormFieldWrapper>

            <FormFieldWrapper
              label="Margen perimetral placa (mm)"
              error={form.formState.errors.margen_perimetral_placa_mm?.message}
            >
              <Input
                type="number"
                min={0}
                step="0.1"
                {...form.register("margen_perimetral_placa_mm", {
                  setValueAs: (value) => (value === "" ? 0 : Number(value)),
                })}
              />
            </FormFieldWrapper>

            <FormFieldWrapper label="Permitir rotación por defecto">
              <div className="flex h-9 items-center">
                <Switch
                  checked={Boolean(form.watch("permitir_rotacion_por_defecto"))}
                  onChange={(event) =>
                    form.setValue("permitir_rotacion_por_defecto", event.currentTarget.checked, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
              </div>
            </FormFieldWrapper>

            <FormFieldWrapper label="Veta obligatoria por defecto">
              <div className="flex h-9 items-center">
                <Switch
                  checked={Boolean(form.watch("veta_obligatoria_por_defecto"))}
                  onChange={(event) =>
                    form.setValue("veta_obligatoria_por_defecto", event.currentTarget.checked, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                />
              </div>
            </FormFieldWrapper>
          </div>
        </SectionCard>
      </form>
    </div>
  );
}

function PercentField({
  label,
  field,
  form,
}: {
  label: string;
  field:
    | "desperdicio_melamina_pct"
    | "margen_medida_pct"
    | "margen_ecommerce_pct"
    | "impuestos_pct"
    | "publicidad_pct"
    | "comision_cobro_pct";
  form: UseFormReturn<SettingsFormInput>;
}) {
  const value = form.watch(field) || 0;
  const error = form.formState.errors[field]?.message;

  return (
    <FormFieldWrapper label={`${label} (%)`} error={error} description={formatPercent(value, 2)}>
      <Input
        type="number"
        min={0}
        max={100}
        step="0.01"
        {...form.register(field, {
          setValueAs: (currentValue) => (currentValue === "" ? 0 : Number(currentValue)),
        })}
      />
    </FormFieldWrapper>
  );
}
