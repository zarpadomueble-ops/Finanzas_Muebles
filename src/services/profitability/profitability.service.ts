import {
  buildProfitabilityOverview,
  type ProfitabilityOverview,
  type ProfitabilityOverviewFilters,
} from "@/domain/profitability";
import { round } from "@/lib/utils";
import { budgetsService } from "@/services/budgets";
import {
  ECOMMERCE_CHANNEL_LABELS,
  ecommerceService,
  type EcommerceChannelKey,
  type EcommerceProductRecord,
} from "@/services/ecommerce";
import { projectsService } from "@/services/projects";
import { settingsService } from "@/services/settings";

function toNonNegative(value: number | null | undefined) {
  if (!Number.isFinite(value ?? NaN)) {
    return 0;
  }

  return Math.max(0, Number(value));
}

function buildChannelConfigs(settings: Awaited<ReturnType<typeof settingsService.getCurrent>>) {
  return [
    {
      channel: "venta_directa" as EcommerceChannelKey,
      label: ECOMMERCE_CHANNEL_LABELS.venta_directa,
      comisionPct: 0,
      publicidadPct: 0,
      impuestosPct: toNonNegative(settings.impuestos_pct),
    },
    {
      channel: "marketplace" as EcommerceChannelKey,
      label: ECOMMERCE_CHANNEL_LABELS.marketplace,
      comisionPct: Math.max(toNonNegative(settings.comision_cobro_pct), 16),
      publicidadPct: toNonNegative(settings.publicidad_pct),
      impuestosPct: toNonNegative(settings.impuestos_pct),
    },
    {
      channel: "tienda_propia" as EcommerceChannelKey,
      label: ECOMMERCE_CHANNEL_LABELS.tienda_propia,
      comisionPct: toNonNegative(settings.comision_cobro_pct),
      publicidadPct: toNonNegative(settings.publicidad_pct),
      impuestosPct: toNonNegative(settings.impuestos_pct),
    },
  ];
}

function buildEcommerceScenarioCost(
  product: EcommerceProductRecord,
  settings: Awaited<ReturnType<typeof settingsService.getCurrent>>,
  chargesPct: number,
) {
  const directCost = toNonNegative(product.costo_base_unit);
  const logisticsCost =
    toNonNegative(product.embalaje_unitario) +
    toNonNegative(settings.embalaje_promedio) +
    toNonNegative(product.envio_unitario) +
    toNonNegative(settings.envio_promedio);
  const baseCost = directCost + logisticsCost;

  return round(baseCost * (1 + chargesPct / 100), 4);
}

export const profitabilityService = {
  async getOverview(
    filters: ProfitabilityOverviewFilters = {},
  ): Promise<ProfitabilityOverview> {
    const [projects, products, budgets, settings] = await Promise.all([
      projectsService.list({ include_deleted: false }),
      ecommerceService.list({ include_deleted: false }),
      budgetsService.list({ include_deleted: false, status: "approved" }),
      settingsService.getCurrent(),
    ]);

    const channelConfigs = buildChannelConfigs(settings);

    return buildProfitabilityOverview(
      {
        rows: [
          ...projects.map((project) => ({
            id: project.id,
            source: "project" as const,
            label: project.nombre_proyecto,
            reference: project.client?.nombre ?? null,
            category: project.tipo_mueble ?? null,
            date: project.fecha,
            status: project.status,
            channel: "A medida",
            cost: Number(project.costo_total || 0),
            price: Number(project.precio_evaluado || project.precio_sugerido || 0),
            materialCost: Number(project.subtotal_materiales || 0),
            laborCost: Number(project.costo_mano_obra || 0),
            logisticsCost: 0,
            commercialCost: Math.max(
              0,
              Number(project.costo_total || 0) - Number(project.costo_directo || 0),
            ),
          })),
          ...products.map((product) => {
            const logisticsCost = Math.max(
              0,
              Number(product.costo_con_embalaje || 0) - Number(product.costo_base_unit || 0),
            ) + toNonNegative(product.envio_unitario);
            const commercialCost = Math.max(
              0,
              Number(product.costo_total_canal || 0) -
                Number(product.costo_base_unit || 0) -
                logisticsCost,
            );

            return {
              id: product.id,
              source: "ecommerce" as const,
              label: product.nombre,
              reference: product.sku,
              category: product.categoria ?? null,
              date: product.updated_at || product.created_at,
              status: product.status,
              channel: "Catalogo",
              cost: Number(product.costo_total_canal || 0),
              price: Number(product.precio_evaluado || product.precio_sugerido || 0),
              materialCost: Number(product.costo_materiales_unit || 0),
              laborCost: Number(product.costo_mano_obra_unit || 0),
              logisticsCost,
              commercialCost,
            };
          }),
        ],
        channelScenarios: [
          ...projects.map((project) => ({
            id: `project:${project.id}`,
            source: "project" as const,
            label: project.nombre_proyecto,
            reference: project.client?.nombre ?? null,
            channel: "a_medida",
            channelLabel: "A medida",
            date: project.fecha,
            cost: Number(project.costo_total || 0),
            price: Number(project.precio_evaluado || project.precio_sugerido || 0),
          })),
          ...products.flatMap((product) =>
            channelConfigs.map((config) => ({
              id: `${product.id}:${config.channel}`,
              source: "ecommerce" as const,
              label: product.nombre,
              reference: product.sku,
              channel: config.channel,
              channelLabel: config.label,
              date: product.updated_at || product.created_at,
              cost: buildEcommerceScenarioCost(
                product,
                settings,
                config.comisionPct + config.publicidadPct + config.impuestosPct,
              ),
              price: Number(product.precio_evaluado || product.precio_sugerido || 0),
            })),
          ),
        ],
        budgetSnapshots: budgets.map((budget) => ({
            id: budget.id,
            label:
              budget.project?.nombre_proyecto ||
              budget.costs_snapshot_data?.source_label ||
              budget.budget_number ||
              "Presupuesto",
            source:
              budget.costs_snapshot_data?.source === "custom_project"
                ? ("project" as const)
                : budget.costs_snapshot_data?.source === "ecommerce_product"
                  ? ("ecommerce" as const)
                  : ("manual" as const),
            issueDate: budget.fecha_emision,
            total: Number(budget.total_snapshot || 0),
            totalCost: Number(budget.costs_snapshot_data?.source_cost_total || 0),
          })),
        fixedCosts: Number(settings.costos_fijos_mes || 0),
      },
      filters,
    );
  },
};

