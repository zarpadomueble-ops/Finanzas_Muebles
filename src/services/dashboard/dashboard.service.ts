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
import type { PostgrestError } from "@supabase/supabase-js";

type QueryResponse<T> = {
  data: T | null;
  error: PostgrestError | null;
};

interface ProjectMaterialUsageRow {
  id: string;
  material_nombre_snapshot: string;
  consumo: number;
  subtotal_snapshot: number;
  material: {
    categoria: string | null;
  } | null;
}

interface EcommerceMaterialUsageRow {
  id: string;
  material_nombre_snapshot: string;
  consumo_unit: number;
  subtotal_snapshot: number;
  material: {
    categoria: string | null;
  } | null;
}

async function loadProjectMaterialUsage(
  context: AuthorizedBrowserContext,
  projectIds: string[],
) {
  if (projectIds.length === 0) {
    return [] as ProjectMaterialUsageRow[];
  }

  const response = (await context.client
    .from("custom_project_materials" as never)
    .select("id, material_nombre_snapshot, consumo, subtotal_snapshot, material:materials(categoria)")
    .eq("profile_id", context.userId)
    .in("custom_project_id", projectIds)
    .is("deleted_at", null)) as QueryResponse<ProjectMaterialUsageRow[]>;

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data ?? [];
}

async function loadEcommerceMaterialUsage(
  context: AuthorizedBrowserContext,
  productIds: string[],
) {
  if (productIds.length === 0) {
    return [] as EcommerceMaterialUsageRow[];
  }

  const response = (await context.client
    .from("ecommerce_product_materials" as never)
    .select("id, material_nombre_snapshot, consumo_unit, subtotal_snapshot, material:materials(categoria)")
    .eq("profile_id", context.userId)
    .in("ecommerce_product_id", productIds)) as QueryResponse<EcommerceMaterialUsageRow[]>;

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data ?? [];
}

export const dashboardService = {
  async getOverview(): Promise<DashboardOverview> {
    const context = await getAuthorizedBrowserContext();
    const [budgets, jobs, cuttingJobs, projects, products] = await Promise.all([
      budgetsService.list({ include_deleted: false, status: "approved" }),
      jobsBoardService.list({ include_deleted: false }),
      cuttingService.list({ include_deleted: false }),
      projectsService.list({ include_deleted: false }),
      ecommerceService.list({ include_deleted: false }),
    ]);

    const [projectMaterials, ecommerceMaterials] = await Promise.all([
      loadProjectMaterialUsage(context, projects.map((project) => project.id)),
      loadEcommerceMaterialUsage(context, products.map((product) => product.id)),
    ]);

    return buildDashboardOverview({
      budgets: budgets.map((budget) => ({
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
      jobs: jobs.map((job) => ({
        id: job.id,
        status: job.estado,
        amount: Number(job.monto_snapshot || 0),
      })),
      cuttingJobs: cuttingJobs.map((job) => ({
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

