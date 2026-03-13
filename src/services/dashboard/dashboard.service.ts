import { buildPeriodStampFromDate, matchesPeriodFilter } from "@/domain/periods";
import { buildDashboardOverview, type DashboardOverview } from "@/domain/profitability";
import { budgetsService } from "@/services/budgets";
import { cuttingService } from "@/services/cutting";
import { ecommerceService } from "@/services/ecommerce";
import { jobsBoardService } from "@/services/jobs-board";
import { projectsService } from "@/services/projects";
import {
  getAuthorizedBrowserContext,
  type AuthorizedBrowserContext,
} from "@/services/shared/authenticated-client";
import type { PeriodFilter } from "@/types";
import type { PostgrestError } from "@supabase/supabase-js";

type QueryResponse<T> = {
  data: T | null;
  error: PostgrestError | null;
};

interface ProjectMaterialUsageRow {
  id: string;
  custom_project_id: string;
  material_nombre_snapshot: string;
  consumo: number;
  subtotal_snapshot: number;
  material: {
    categoria: string | null;
  } | null;
}

interface EcommerceMaterialUsageRow {
  id: string;
  ecommerce_product_id: string;
  material_nombre_snapshot: string;
  consumo_unit: number;
  subtotal_snapshot: number;
  material: {
    categoria: string | null;
  } | null;
}

function fallbackPeriod(recordDate: string) {
  return {
    record_date: recordDate.slice(0, 10),
    month: Number(recordDate.slice(5, 7)),
    year: Number(recordDate.slice(0, 4)),
    period_key: recordDate.slice(0, 7),
  };
}

async function loadProjectMaterialUsage(context: AuthorizedBrowserContext, projectIds: string[]) {
  if (projectIds.length === 0) {
    return [] as ProjectMaterialUsageRow[];
  }

  const response = (await context.client
    .from("custom_project_materials" as never)
    .select(
      "id, custom_project_id, material_nombre_snapshot, consumo, subtotal_snapshot, material:materials(categoria)",
    )
    .eq("profile_id", context.userId)
    .in("custom_project_id", projectIds)
    .is("deleted_at", null)) as QueryResponse<ProjectMaterialUsageRow[]>;

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data ?? [];
}

async function loadEcommerceMaterialUsage(context: AuthorizedBrowserContext, productIds: string[]) {
  if (productIds.length === 0) {
    return [] as EcommerceMaterialUsageRow[];
  }

  const response = (await context.client
    .from("ecommerce_product_materials" as never)
    .select(
      "id, ecommerce_product_id, material_nombre_snapshot, consumo_unit, subtotal_snapshot, material:materials(categoria)",
    )
    .eq("profile_id", context.userId)
    .in("ecommerce_product_id", productIds)) as QueryResponse<EcommerceMaterialUsageRow[]>;

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data ?? [];
}

export const dashboardService = {
  async getOverview(filter: PeriodFilter): Promise<DashboardOverview> {
    const context = await getAuthorizedBrowserContext();
    const [budgets, jobs, cuttingJobs, projects, products] = await Promise.all([
      budgetsService.list({ include_deleted: false, status: "approved" }),
      jobsBoardService.list({ include_deleted: false }),
      cuttingService.list({ include_deleted: false }),
      projectsService.list({ include_deleted: false }),
      ecommerceService.list({ include_deleted: false }),
    ]);

    const filteredBudgets = budgets.filter((budget) =>
      matchesPeriodFilter(
        buildPeriodStampFromDate(budget.record_date || budget.fecha_emision) ??
          fallbackPeriod(budget.fecha_emision),
        filter,
      ),
    );
    const filteredJobs = jobs.filter((job) =>
      matchesPeriodFilter(
        buildPeriodStampFromDate(job.fecha_inicio || job.fecha_prometida || job.created_at) ??
          fallbackPeriod(job.created_at),
        filter,
      ),
    );
    const filteredCuttingJobs = cuttingJobs.filter((job) =>
      matchesPeriodFilter(
        buildPeriodStampFromDate(job.record_date || job.created_at) ?? fallbackPeriod(job.created_at),
        filter,
      ),
    );
    const filteredProjects = projects.filter((project) =>
      matchesPeriodFilter(
        buildPeriodStampFromDate(project.record_date || project.fecha) ?? fallbackPeriod(project.fecha),
        filter,
      ),
    );
    const filteredProducts = products.filter((product) =>
      matchesPeriodFilter(
        buildPeriodStampFromDate(product.record_date || product.created_at) ??
          fallbackPeriod(product.created_at),
        filter,
      ),
    );

    const [projectMaterials, ecommerceMaterials] = await Promise.all([
      loadProjectMaterialUsage(context, filteredProjects.map((project) => project.id)),
      loadEcommerceMaterialUsage(context, filteredProducts.map((product) => product.id)),
    ]);

    return buildDashboardOverview({
      budgets: filteredBudgets.map((budget) => ({
        id: budget.id,
        label:
          budget.project?.nombre_proyecto ||
          budget.costs_snapshot_data?.source_label ||
          budget.budget_number ||
          "Presupuesto",
        issueDate: budget.fecha_emision,
        status: budget.estado,
        total: Number(budget.total_snapshot || 0),
        totalCost: Number(budget.costs_snapshot_data?.source_cost_total || 0),
        utility: Number(
          budget.pricing_snapshot_data?.profitability?.utilidad ??
            Number(budget.total_snapshot || 0) -
              Number(budget.costs_snapshot_data?.source_cost_total || 0),
        ),
        marginPct: Number(budget.pricing_snapshot_data?.profitability?.margenRealPct || 0),
      })),
      jobs: filteredJobs.map((job) => ({
        id: job.id,
        status: job.estado,
        amount: Number(job.monto_snapshot || 0),
      })),
      cuttingJobs: filteredCuttingJobs.map((job) => ({
        id: job.id,
        status: job.status,
        boardsUsed: Number(job.placas_necesarias_snapshot || 0),
        boardCost: Number(job.costo_placas_snapshot || 0),
        utilizationPct: Number(job.aprovechamiento_pct_snapshot || 0),
      })),
      materials: [
        ...projectMaterials.map((row) => ({
          id: `project:${row.id}`,
          materialName: row.material_nombre_snapshot,
          category: row.material?.categoria ?? null,
          quantity: Number(row.consumo || 0),
          cost: Number(row.subtotal_snapshot || 0),
        })),
        ...ecommerceMaterials.map((row) => ({
          id: `ecommerce:${row.id}`,
          materialName: row.material_nombre_snapshot,
          category: row.material?.categoria ?? null,
          quantity: Number(row.consumo_unit || 0),
          cost: Number(row.subtotal_snapshot || 0),
        })),
      ],
    });
  },
};
