import type { Json, TableInsert, TableRow, TableUpdate } from "@/types";
import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import {
  calculateBudgetProfitability,
  calculateBudgetSummary,
  type BudgetCostLineInput,
  type BudgetCostSnapshot,
  type BudgetCostSummary,
  type BudgetDiscountType,
} from "@/domain/costing";
import { buildBudgetWhatsAppText } from "@/domain/budgets";
import { projectsService, type ProjectDetailRecord } from "@/services/projects";
import { getSupabaseBrowserClient, hasSupabaseConfig } from "@/services/supabase/browser-client";

const BUDGETS_TABLE = "budgets" as const;
const BUDGET_ITEMS_TABLE = "budget_items" as const;
const CLIENTS_TABLE = "clients" as const;

const BUDGETS_SELECT =
  "*, client:clients(id, nombre, telefono, email), project:custom_projects(id, nombre_proyecto, fecha, costo_total, precio_sugerido, status)";

type QueryResponse<T> = {
  data: T | null;
  error: PostgrestError | null;
};

type MutationResponse = {
  error: PostgrestError | null;
};

type BudgetRow = TableRow<typeof BUDGETS_TABLE>;
type BudgetInsert = TableInsert<typeof BUDGETS_TABLE>;
type BudgetUpdate = TableUpdate<typeof BUDGETS_TABLE>;
type BudgetItemRow = TableRow<typeof BUDGET_ITEMS_TABLE>;
type BudgetItemInsert = TableInsert<typeof BUDGET_ITEMS_TABLE>;

interface AuthorizedContext {
  client: SupabaseClient;
  userId: string;
}

interface BudgetRowWithRelations extends BudgetRow {
  client: BudgetClientPreview | null;
  project: BudgetProjectPreview | null;
}

export const BUDGET_STATUS_OPTIONS = [
  "draft",
  "sent",
  "approved",
  "rejected",
  "expired",
] as const;

export const BUDGET_STATUS_LABELS: Record<(typeof BUDGET_STATUS_OPTIONS)[number], string> = {
  draft: "Borrador",
  sent: "Enviado",
  approved: "Aprobado",
  rejected: "Rechazado",
  expired: "Vencido",
};

export type BudgetStatusValue = (typeof BUDGET_STATUS_OPTIONS)[number];
export type BudgetLineConcept = "fabricacion" | "instalacion" | "flete" | "descuento" | "otro";

export interface BudgetClientPreview {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
}

export interface BudgetProjectPreview {
  id: string;
  nombre_proyecto: string;
  fecha: string;
  costo_total: number;
  precio_sugerido: number;
  status: string;
}

export interface BudgetCostsSnapshotEnvelope {
  version: number;
  source: BudgetCostSnapshot["source"];
  source_label: string | null;
  source_cost_total: number;
  source_cost_snapshot: BudgetCostSnapshot["sourceCostSnapshot"];
}

export interface BudgetPricingSnapshotEnvelope {
  version: number;
  discount_type: BudgetDiscountType;
  discount_value: number;
  summary: BudgetCostSummary;
  profitability: ReturnType<typeof calculateBudgetProfitability> | null;
}

export interface BudgetTermsSnapshotEnvelope {
  version: number;
  notes: string | null;
  payment_method: string | null;
  valid_until: string | null;
  whatsapp_text: string | null;
}

export interface BudgetRecord extends BudgetRowWithRelations {
  estado: BudgetStatusValue;
  costs_snapshot_data: BudgetCostsSnapshotEnvelope | null;
  pricing_snapshot_data: BudgetPricingSnapshotEnvelope | null;
  terms_snapshot_data: BudgetTermsSnapshotEnvelope | null;
}

export type BudgetItemRecord = BudgetItemRow;

export interface BudgetDetailRecord {
  budget: BudgetRecord;
  items: BudgetItemRecord[];
}

export interface BudgetsListFilters {
  search?: string;
  status?: string;
  client_id?: string;
  include_deleted?: boolean;
}

export interface BudgetDraftLineInput {
  concepto: BudgetLineConcept;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
}

export interface BudgetBundleMutationInput {
  budget: {
    id?: string;
    client_id: string;
    custom_project_id: string | null;
    source_label: string | null;
    fecha_emision: string;
    fecha_validez: string | null;
    forma_pago: string;
    estado: BudgetStatusValue;
    moneda: string;
    descuento_tipo: BudgetDiscountType;
    descuento_valor: number;
    sena: number;
    notas: string;
  };
  items: BudgetDraftLineInput[];
}

export interface BudgetProjectDraftRecord {
  client_id: string;
  custom_project_id: string;
  source_label: string;
  source_cost_total: number;
  source_cost_snapshot: BudgetCostSnapshot["sourceCostSnapshot"];
  lines: BudgetDraftLineInput[];
}

function normalizeString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeNumber(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return 0;
  }

  return value;
}

function normalizeNonNegative(value: number | null | undefined) {
  return Math.max(0, normalizeNumber(value));
}

function normalizeDate(value: string | null | undefined) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return new Date().toISOString().slice(0, 10);
  }

  return normalized.includes("T") ? normalized.slice(0, 10) : normalized;
}

function normalizeStatus(value: string | null | undefined): BudgetStatusValue {
  const normalized = value?.trim().toLowerCase() ?? "";
  return BUDGET_STATUS_OPTIONS.includes(normalized as BudgetStatusValue)
    ? (normalized as BudgetStatusValue)
    : "draft";
}

function parseSnapshot<T>(value: Json | null | undefined): T | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as T;
}

function buildBudgetNumber() {
  const timestamp = Date.now().toString().slice(-10);
  return `PRES-${timestamp}`;
}

function mapBudgetRecord(row: BudgetRowWithRelations): BudgetRecord {
  return {
    ...row,
    estado: normalizeStatus(row.estado),
    costs_snapshot_data: parseSnapshot<BudgetCostsSnapshotEnvelope>(row.costs_snapshot),
    pricing_snapshot_data: parseSnapshot<BudgetPricingSnapshotEnvelope>(row.pricing_snapshot),
    terms_snapshot_data: parseSnapshot<BudgetTermsSnapshotEnvelope>(row.terms_snapshot),
  };
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

async function getClientByIdWithContext(context: AuthorizedContext, clientId: string) {
  if (!clientId) {
    return null;
  }

  const response = (await context.client
    .from(CLIENTS_TABLE as never)
    .select("id, nombre, telefono, email")
    .eq("id", clientId)
    .eq("profile_id", context.userId)
    .maybeSingle()) as QueryResponse<BudgetClientPreview>;

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data;
}

async function getBudgetByIdWithContext(
  context: AuthorizedContext,
  budgetId: string,
  includeDeleted = true,
) {
  let query = context.client
    .from(BUDGETS_TABLE as never)
    .select(BUDGETS_SELECT)
    .eq("id", budgetId)
    .eq("profile_id", context.userId);

  if (!includeDeleted) {
    query = query.is("deleted_at", null);
  }

  const response = (await query.maybeSingle()) as QueryResponse<BudgetRowWithRelations>;
  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data ? mapBudgetRecord(response.data) : null;
}

async function getBudgetItemsWithContext(
  context: AuthorizedContext,
  budgetId: string,
) {
  const response = (await context.client
    .from(BUDGET_ITEMS_TABLE as never)
    .select("*")
    .eq("profile_id", context.userId)
    .eq("budget_id", budgetId)
    .order("line_order", { ascending: true })) as QueryResponse<BudgetItemRecord[]>;

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data ?? [];
}

function buildCostsSnapshotEnvelope(params: {
  source: BudgetCostSnapshot["source"];
  sourceLabel: string | null;
  sourceCostTotal: number;
  sourceCostSnapshot: BudgetCostSnapshot["sourceCostSnapshot"];
}): Json {
  const snapshot: BudgetCostsSnapshotEnvelope = {
    version: 1,
    source: params.source,
    source_label: params.sourceLabel,
    source_cost_total: params.sourceCostTotal,
    source_cost_snapshot: params.sourceCostSnapshot,
  };

  return snapshot as unknown as Json;
}

function buildPricingSnapshotEnvelope(params: {
  discountType: BudgetDiscountType;
  discountValue: number;
  summary: BudgetCostSummary;
  profitability: ReturnType<typeof calculateBudgetProfitability> | null;
}): Json {
  const snapshot: BudgetPricingSnapshotEnvelope = {
    version: 1,
    discount_type: params.discountType,
    discount_value: params.discountValue,
    summary: params.summary,
    profitability: params.profitability,
  };

  return snapshot as unknown as Json;
}

function buildTermsSnapshotEnvelope(params: {
  notes: string | null;
  paymentMethod: string | null;
  validUntil: string | null;
  whatsappText: string | null;
}): Json {
  const snapshot: BudgetTermsSnapshotEnvelope = {
    version: 1,
    notes: params.notes,
    payment_method: params.paymentMethod,
    valid_until: params.validUntil,
    whatsapp_text: params.whatsappText,
  };

  return snapshot as unknown as Json;
}

function mapLinesToCostInput(lines: BudgetDraftLineInput[]): BudgetCostLineInput[] {
  return lines.map((line) => ({
    concepto: line.concepto,
    descripcion: line.descripcion.trim(),
    cantidad: Math.max(0, normalizeNumber(line.cantidad)),
    precioUnitario: normalizeNumber(line.precio_unitario),
  }));
}

function resolveCostsSnapshot(params: {
  existingBudget: BudgetRecord | null;
  projectDetail: ProjectDetailRecord | null;
  projectId: string | null;
  sourceLabel: string | null;
}): BudgetCostsSnapshotEnvelope {
  const existingSnapshot = params.existingBudget?.costs_snapshot_data ?? null;
  const existingProjectId = normalizeString(params.existingBudget?.custom_project_id);
  const projectChanged = existingProjectId !== params.projectId;

  if (params.projectId) {
    if (existingSnapshot && !projectChanged && existingSnapshot.source === "custom_project") {
      return existingSnapshot;
    }

    if (!params.projectDetail) {
      throw new Error("No se encontro el proyecto seleccionado.");
    }

    return {
      version: 1,
      source: "custom_project",
      source_label: params.projectDetail.project.nombre_proyecto,
      source_cost_total: normalizeNonNegative(params.projectDetail.project.costo_total),
      source_cost_snapshot: params.projectDetail.project.costing_snapshot,
    };
  }

  return {
    version: 1,
    source: "manual",
    source_label:
      params.sourceLabel ??
      (existingSnapshot?.source === "manual" ? existingSnapshot.source_label : null),
    source_cost_total:
      existingSnapshot?.source === "manual" && !projectChanged
        ? normalizeNonNegative(existingSnapshot.source_cost_total)
        : 0,
    source_cost_snapshot:
      existingSnapshot?.source === "manual" && !projectChanged
        ? existingSnapshot.source_cost_snapshot
        : null,
  };
}

async function getBudgetDetailWithContext(
  context: AuthorizedContext,
  budgetId: string,
): Promise<BudgetDetailRecord | null> {
  const [budget, items] = await Promise.all([
    getBudgetByIdWithContext(context, budgetId, true),
    getBudgetItemsWithContext(context, budgetId),
  ]);

  if (!budget) {
    return null;
  }

  return {
    budget,
    items,
  };
}

export const budgetsService = {
  async list(filters: BudgetsListFilters = {}): Promise<BudgetRecord[]> {
    const context = await getAuthorizedContext();

    let query = context.client
      .from(BUDGETS_TABLE as never)
      .select(BUDGETS_SELECT)
      .eq("profile_id", context.userId);

    if (!filters.include_deleted) {
      query = query.is("deleted_at", null);
    }

    if (filters.client_id?.trim()) {
      query = query.eq("client_id", filters.client_id);
    }

    if (filters.status?.trim()) {
      query = query.eq("estado", normalizeStatus(filters.status));
    }

    const response = (await query.order("updated_at", { ascending: false })) as QueryResponse<
      BudgetRowWithRelations[]
    >;

    if (response.error) {
      throw new Error(response.error.message);
    }

    const rows = (response.data ?? []).map(mapBudgetRecord);
    if (!filters.search?.trim()) {
      return rows;
    }

    const needle = filters.search.trim().toLowerCase();
    return rows.filter((row) =>
      [
        row.budget_number ?? "",
        row.client?.nombre ?? "",
        row.project?.nombre_proyecto ?? "",
        row.estado,
        row.forma_pago ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  },

  async getDetail(budgetId: string): Promise<BudgetDetailRecord | null> {
    const context = await getAuthorizedContext();
    return getBudgetDetailWithContext(context, budgetId);
  },

  async buildFromProject(projectId: string): Promise<BudgetProjectDraftRecord> {
    const detail = await projectsService.getDetail(projectId);
    if (!detail) {
      throw new Error("No se encontro el proyecto seleccionado.");
    }

    if (!detail.project.client_id) {
      throw new Error("El proyecto no tiene cliente asignado.");
    }

    return {
      client_id: detail.project.client_id,
      custom_project_id: detail.project.id,
      source_label: detail.project.nombre_proyecto,
      source_cost_total: normalizeNonNegative(detail.project.costo_total),
      source_cost_snapshot: detail.project.costing_snapshot,
      lines: [
        {
          concepto: "fabricacion",
          descripcion: `Fabricacion ${detail.project.nombre_proyecto}`,
          cantidad: 1,
          precio_unitario: normalizeNonNegative(detail.project.precio_evaluado || detail.project.precio_sugerido),
        },
      ],
    };
  },

  async saveBundle(input: BudgetBundleMutationInput): Promise<BudgetDetailRecord> {
    const context = await getAuthorizedContext();
    const existingBudget = input.budget.id
      ? await getBudgetByIdWithContext(context, input.budget.id, true)
      : null;
    const normalizedProjectId = normalizeString(input.budget.custom_project_id);
    const projectDetail: ProjectDetailRecord | null = normalizedProjectId
      ? await projectsService.getDetail(normalizedProjectId)
      : null;

    const normalizedItems = input.items.map((line) => ({
      concepto: line.concepto,
      descripcion: line.descripcion.trim(),
      cantidad: Math.max(0, normalizeNumber(line.cantidad)),
      precio_unitario: normalizeNumber(line.precio_unitario),
    }));

    if (normalizedProjectId && !projectDetail) {
      throw new Error("No se encontro el proyecto seleccionado.");
    }

    if (normalizedProjectId && !projectDetail?.project.client_id) {
      throw new Error("El proyecto seleccionado no tiene cliente asignado.");
    }

    const resolvedClientId =
      projectDetail?.project.client_id ||
      input.budget.client_id ||
      existingBudget?.client_id ||
      "";
    if (!resolvedClientId) {
      throw new Error("Selecciona un cliente para el presupuesto.");
    }

    const clientRecord = await getClientByIdWithContext(context, resolvedClientId);
    const lines = mapLinesToCostInput(normalizedItems);
    const summary = calculateBudgetSummary({
      lines,
      senia: normalizeNonNegative(input.budget.sena),
      discountType: input.budget.descuento_tipo,
      discountValue: normalizeNonNegative(input.budget.descuento_valor),
    });
    const costsSnapshot = resolveCostsSnapshot({
      existingBudget,
      projectDetail,
      projectId: normalizedProjectId,
      sourceLabel: normalizeString(input.budget.source_label),
    });
    const sourceCostTotal = normalizeNonNegative(costsSnapshot.source_cost_total);
    const budgetNumber = normalizeString(existingBudget?.budget_number) ?? buildBudgetNumber();

    const profitability =
      sourceCostTotal > 0
        ? calculateBudgetProfitability({
            price: summary.total,
            totalCost: sourceCostTotal,
          })
        : null;

    const whatsappText = buildBudgetWhatsAppText({
      budgetNumber,
      clientName: clientRecord?.nombre ?? "Cliente",
      issueDate: normalizeDate(input.budget.fecha_emision),
      validUntil: normalizeString(input.budget.fecha_validez),
      paymentMethod: normalizeString(input.budget.forma_pago),
      notes: normalizeString(input.budget.notas),
      subtotal: summary.subtotal,
      discountAmount: summary.discountAmount,
      total: summary.total,
      deposit: summary.senia,
      balance: summary.saldo,
      lines: summary.lines.map((line) => ({
        description: line.descripcion,
        quantity: line.cantidad,
        unitPrice: line.precioUnitario,
        total: line.subtotal,
      })),
    });

    const budgetPayload: BudgetUpdate = {
      client_id: resolvedClientId,
      custom_project_id: normalizedProjectId,
      ecommerce_product_id: null,
      budget_number: budgetNumber,
      fecha_emision: normalizeDate(input.budget.fecha_emision),
      fecha_validez: normalizeString(input.budget.fecha_validez),
      forma_pago: normalizeString(input.budget.forma_pago),
      estado: normalizeStatus(input.budget.estado),
      moneda: normalizeString(input.budget.moneda) ?? "ARS",
      subtotal_snapshot: summary.subtotal,
      descuento_snapshot: summary.discountAmount,
      impuestos_snapshot: 0,
      total_snapshot: summary.total,
      sena_snapshot: summary.senia,
      saldo_snapshot: summary.saldo,
      costs_snapshot: buildCostsSnapshotEnvelope({
        source: costsSnapshot.source,
        sourceLabel: costsSnapshot.source_label,
        sourceCostTotal: costsSnapshot.source_cost_total,
        sourceCostSnapshot: costsSnapshot.source_cost_snapshot,
      }),
      pricing_snapshot: buildPricingSnapshotEnvelope({
        discountType: input.budget.descuento_tipo,
        discountValue: normalizeNonNegative(input.budget.descuento_valor),
        summary,
        profitability,
      }),
      terms_snapshot: buildTermsSnapshotEnvelope({
        notes: normalizeString(input.budget.notas),
        paymentMethod: normalizeString(input.budget.forma_pago),
        validUntil: normalizeString(input.budget.fecha_validez),
        whatsappText,
      }),
      locked_at: null,
      updated_by: context.userId,
      deleted_at: null,
      deleted_by: null,
    };

    const budgetResponse = input.budget.id
      ? ((await context.client
          .from(BUDGETS_TABLE as never)
          .update(budgetPayload as never)
          .eq("id", input.budget.id)
          .eq("profile_id", context.userId)
          .select(BUDGETS_SELECT)
          .single()) as QueryResponse<BudgetRowWithRelations>)
      : ((await context.client
          .from(BUDGETS_TABLE as never)
          .insert(
            {
              ...(budgetPayload as BudgetInsert),
              profile_id: context.userId,
              created_by: context.userId,
            } as never,
          )
          .select(BUDGETS_SELECT)
          .single()) as QueryResponse<BudgetRowWithRelations>);

    if (budgetResponse.error || !budgetResponse.data) {
      throw new Error(budgetResponse.error?.message || "No se pudo guardar el presupuesto.");
    }

    const savedBudget = budgetResponse.data;

    const deleteItemsResponse = (await context.client
      .from(BUDGET_ITEMS_TABLE as never)
      .delete()
      .eq("profile_id", context.userId)
      .eq("budget_id", savedBudget.id)) as MutationResponse;

    if (deleteItemsResponse.error) {
      throw new Error(deleteItemsResponse.error.message);
    }

    const itemRows: BudgetItemInsert[] = summary.lines.map((line, index) => ({
      profile_id: context.userId,
      budget_id: savedBudget.id,
      line_order: index + 1,
      concepto: line.concepto,
      descripcion: line.descripcion,
      cantidad: line.cantidad,
      precio_unitario_snapshot: line.precioUnitario,
      descuento_pct_snapshot: 0,
      impuestos_pct_snapshot: 0,
      subtotal_snapshot: line.subtotal,
      total_snapshot: line.subtotal,
      created_by: context.userId,
      updated_by: context.userId,
    }));

    if (itemRows.length > 0) {
      const insertItemsResponse = (await context.client
        .from(BUDGET_ITEMS_TABLE as never)
        .insert(itemRows as never)) as MutationResponse;

      if (insertItemsResponse.error) {
        throw new Error(insertItemsResponse.error.message);
      }
    }

    const detail = await getBudgetDetailWithContext(context, savedBudget.id);
    if (!detail) {
      throw new Error("No se pudo recuperar el presupuesto guardado.");
    }

    return detail;
  },
};
