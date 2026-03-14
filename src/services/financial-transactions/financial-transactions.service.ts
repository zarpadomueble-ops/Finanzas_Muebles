import type { PostgrestError } from "@supabase/supabase-js";
import {
  buildMonthlyFinanceSummary,
  type FinanceMetricRecord,
  type FinanceSummary,
} from "@/domain/finances";
import { getAuthorizedBrowserContext } from "@/services/shared/authenticated-client";
import { settingsService } from "@/services/settings";
import type { PeriodFilter, TableInsert, TableRow, TableUpdate } from "@/types";

const FINANCIAL_TRANSACTIONS_TABLE = "financial_transactions" as const;
const CATEGORIES_TABLE = "categories" as const;
const PURCHASES_TABLE = "purchases" as const;
const BUDGETS_TABLE = "budgets" as const;

const FINANCIAL_SELECT =
  "*, category:categories(id, code, name, direction), client:clients(id, nombre), supplier:suppliers(id, nombre), project:custom_projects(id, nombre_proyecto, fecha), budget:budgets(id, budget_number, estado, total_snapshot), job:jobs_board(id, titulo, estado), purchase:purchases(id, fecha_emision, status, total_snapshot)";

type QueryResponse<T> = {
  data: T | null;
  error: PostgrestError | null;
};

type FinancialTransactionRow = TableRow<typeof FINANCIAL_TRANSACTIONS_TABLE>;
type FinancialTransactionInsert = TableInsert<typeof FINANCIAL_TRANSACTIONS_TABLE>;
type FinancialTransactionUpdate = TableUpdate<typeof FINANCIAL_TRANSACTIONS_TABLE>;
type FinancialCategoryRow = TableRow<typeof CATEGORIES_TABLE>;
type PurchaseRow = TableRow<typeof PURCHASES_TABLE>;
type BudgetRow = TableRow<typeof BUDGETS_TABLE>;

interface FinancialCategoryRelation {
  id: string;
  code: string;
  name: string;
  direction: string;
}

interface FinancialTransactionRowWithRelations extends FinancialTransactionRow {
  category: FinancialCategoryRelation | null;
  client: { id: string; nombre: string } | null;
  supplier: { id: string; nombre: string } | null;
  project: { id: string; nombre_proyecto: string; fecha: string } | null;
  budget: { id: string; budget_number: string | null; estado: string; total_snapshot: number } | null;
  job: { id: string; titulo: string | null; estado: string } | null;
  purchase: { id: string; fecha_emision: string; status: string; total_snapshot: number } | null;
}

export const FINANCE_TRANSACTION_TYPE_OPTIONS = ["income", "expense"] as const;
export const FINANCE_STATUS_OPTIONS = ["pending", "paid", "collected", "void"] as const;

export type FinanceTransactionTypeValue = (typeof FINANCE_TRANSACTION_TYPE_OPTIONS)[number];
export type FinanceTransactionStatusValue = (typeof FINANCE_STATUS_OPTIONS)[number];

export interface FinanceCategorySeed {
  code: string;
  name: string;
  direction: "income" | "expense" | "both";
  sort_order: number;
}

export interface FinanceTransactionRecord extends FinancialTransactionRowWithRelations {
  type: FinanceTransactionTypeValue;
  status: FinanceTransactionStatusValue;
  category_label: string;
}

export interface FinanceFormOptions {
  categories: FinancialCategoryRow[];
  clients: Array<{ id: string; nombre: string }>;
  suppliers: Array<{ id: string; nombre: string }>;
  projects: Array<{ id: string; nombre_proyecto: string }>;
  budgets: Array<{ id: string; budget_number: string | null }>;
}

export interface FinanceListFilters extends PeriodFilter {
  search?: string;
  type?: FinanceTransactionTypeValue | "";
  status?: FinanceTransactionStatusValue | "";
  category_id?: string;
  client_id?: string;
  supplier_id?: string;
  custom_project_id?: string;
  budget_id?: string;
  include_deleted?: boolean;
}

export interface FinanceCreateInput {
  type: FinanceTransactionTypeValue;
  category_id: string;
  subcategory?: string | null;
  description: string;
  amount: number;
  currency?: string;
  exchange_rate_to_base?: number;
  payment_method?: string | null;
  status?: FinanceTransactionStatusValue;
  record_date: string;
  client_id?: string | null;
  supplier_id?: string | null;
  custom_project_id?: string | null;
  budget_id?: string | null;
  job_id?: string | null;
  purchase_id?: string | null;
  source_module?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  notes?: string | null;
}

const DEFAULT_FINANCE_CATEGORIES: FinanceCategorySeed[] = [
  { code: "income_sales", name: "Ventas", direction: "income", sort_order: 1 },
  { code: "income_advance", name: "Anticipos", direction: "income", sort_order: 2 },
  { code: "income_other", name: "Otros ingresos", direction: "income", sort_order: 9 },
  { code: "expense_materials", name: "Compra de materiales", direction: "expense", sort_order: 1 },
  { code: "expense_suppliers", name: "Pago a proveedores", direction: "expense", sort_order: 2 },
  { code: "expense_tax", name: "Impuestos", direction: "expense", sort_order: 8 },
  { code: "expense_other", name: "Otros egresos", direction: "expense", sort_order: 9 },
];

async function listFinanceCategories(context: Awaited<ReturnType<typeof getAuthorizedBrowserContext>>) {
  const response = (await context.client
    .from(CATEGORIES_TABLE as never)
    .select("*")
    .eq("profile_id", context.userId)
    .eq("domain", "finance")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })) as QueryResponse<FinancialCategoryRow[]>;

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data ?? [];
}

function roundAmount(value: number, digits = 2) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function normalizeString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeNumber(value: number | null | undefined, fallback = 0) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return fallback;
  }

  return value;
}

function normalizeDate(value: string | null | undefined) {
  const normalized = normalizeString(value);
  if (!normalized) {
    return new Date().toISOString().slice(0, 10);
  }

  return normalized.includes("T") ? normalized.slice(0, 10) : normalized;
}

function normalizeTransactionType(value: string | null | undefined): FinanceTransactionTypeValue {
  return value === "income" ? "income" : "expense";
}

function normalizeTransactionStatus(value: string | null | undefined): FinanceTransactionStatusValue {
  if (value === "paid" || value === "collected" || value === "void") {
    return value;
  }

  return "pending";
}

function mapTransactionRecord(row: FinancialTransactionRowWithRelations): FinanceTransactionRecord {
  return {
    ...row,
    type: normalizeTransactionType(row.type),
    status: normalizeTransactionStatus(row.status),
    category_label: row.category?.name ?? "Sin categoria",
  };
}

function toMetricRecord(row: FinanceTransactionRecord): FinanceMetricRecord {
  return {
    id: row.id,
    type: row.type,
    amount_base: Number(row.amount_base || 0),
    amount: Number(row.amount || 0),
    status: row.status,
    period_key: row.period_key,
    month: row.month,
    year: row.year,
    record_date: row.record_date,
    description: row.description,
    category_label: row.category_label,
  };
}

async function ensureDefaultCategories() {
  const context = await getAuthorizedBrowserContext();
  const existing = await listFinanceCategories(context);
  const existingCodes = new Set(existing.map((category) => category.code));
  const missing = DEFAULT_FINANCE_CATEGORIES.filter((category) => !existingCodes.has(category.code));

  if (missing.length === 0) {
    return existing;
  }

  const upsertResponse = (await context.client
    .from(CATEGORIES_TABLE as never)
    .upsert(
      missing.map(
        (category) =>
          ({
            profile_id: context.userId,
            domain: "finance",
            direction: category.direction,
            code: category.code,
            name: category.name,
            description: null,
            is_system: true,
            is_active: true,
            sort_order: category.sort_order,
            deleted_at: null,
            deleted_by: null,
            created_by: context.userId,
            updated_by: context.userId,
          }) as TableInsert<typeof CATEGORIES_TABLE>,
      ) as never,
      {
        onConflict: "profile_id,domain,code",
      } as never,
    )
    .select("*")) as QueryResponse<FinancialCategoryRow[]>;

  if (upsertResponse.error) {
    throw new Error(upsertResponse.error.message);
  }

  const refreshed = await listFinanceCategories(context);

  return refreshed.sort((left, right) => {
    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order;
    }

    return left.name.localeCompare(right.name);
  });
}

async function loadFormOptions(): Promise<FinanceFormOptions> {
  const context = await getAuthorizedBrowserContext();
  const categories = await ensureDefaultCategories();

  const [clientsResponse, suppliersResponse, projectsResponse, budgetsResponse] = (await Promise.all([
    context.client
      .from("clients" as never)
      .select("id, nombre")
      .eq("profile_id", context.userId)
      .is("deleted_at", null)
      .order("nombre", { ascending: true }),
    context.client
      .from("suppliers" as never)
      .select("id, nombre")
      .eq("profile_id", context.userId)
      .is("deleted_at", null)
      .order("nombre", { ascending: true }),
    context.client
      .from("custom_projects" as never)
      .select("id, nombre_proyecto")
      .eq("profile_id", context.userId)
      .is("deleted_at", null)
      .order("fecha", { ascending: false }),
    context.client
      .from("budgets" as never)
      .select("id, budget_number")
      .eq("profile_id", context.userId)
      .is("deleted_at", null)
      .order("fecha_emision", { ascending: false }),
  ])) as [
    QueryResponse<Array<{ id: string; nombre: string }>>,
    QueryResponse<Array<{ id: string; nombre: string }>>,
    QueryResponse<Array<{ id: string; nombre_proyecto: string }>>,
    QueryResponse<Array<{ id: string; budget_number: string | null }>>,
  ];

  if (clientsResponse.error || suppliersResponse.error || projectsResponse.error || budgetsResponse.error) {
    throw new Error(
      clientsResponse.error?.message ||
        suppliersResponse.error?.message ||
        projectsResponse.error?.message ||
        budgetsResponse.error?.message ||
        "No se pudieron cargar las opciones de finanzas.",
    );
  }

  return {
    categories,
    clients: clientsResponse.data ?? [],
    suppliers: suppliersResponse.data ?? [],
    projects: projectsResponse.data ?? [],
    budgets: budgetsResponse.data ?? [],
  };
}

async function getTransactionById(transactionId: string) {
  const context = await getAuthorizedBrowserContext();

  const response = (await context.client
    .from(FINANCIAL_TRANSACTIONS_TABLE as never)
    .select(FINANCIAL_SELECT)
    .eq("profile_id", context.userId)
    .eq("id", transactionId)
    .maybeSingle()) as QueryResponse<FinancialTransactionRowWithRelations>;

  if (response.error) {
    throw new Error(response.error.message);
  }

  return response.data ? mapTransactionRecord(response.data) : null;
}

export const financialTransactionsService = {
  async list(filters: FinanceListFilters): Promise<FinanceTransactionRecord[]> {
    await ensureDefaultCategories();
    const context = await getAuthorizedBrowserContext();

    let query = context.client
      .from(FINANCIAL_TRANSACTIONS_TABLE as never)
      .select(FINANCIAL_SELECT)
      .eq("profile_id", context.userId);

    if (!filters.include_deleted) {
      query = query.is("deleted_at", null);
    }

    if (filters.period_key) {
      query = query.eq("period_key", filters.period_key);
    } else {
      if (filters.year !== "all") {
        query = query.eq("year", filters.year);
      }

      if (filters.month !== "all") {
        query = query.eq("month", filters.month);
      }
    }

    if (filters.type) {
      query = query.eq("type", filters.type);
    }

    if (filters.status) {
      query = query.eq("status", filters.status);
    }

    if (filters.category_id?.trim()) {
      query = query.eq("category_id", filters.category_id);
    }

    if (filters.client_id?.trim()) {
      query = query.eq("client_id", filters.client_id);
    }

    if (filters.supplier_id?.trim()) {
      query = query.eq("supplier_id", filters.supplier_id);
    }

    if (filters.custom_project_id?.trim()) {
      query = query.eq("custom_project_id", filters.custom_project_id);
    }

    if (filters.budget_id?.trim()) {
      query = query.eq("budget_id", filters.budget_id);
    }

    const response = (await query
      .order("record_date", { ascending: false })
      .order("created_at", { ascending: false })) as QueryResponse<FinancialTransactionRowWithRelations[]>;

    if (response.error) {
      throw new Error(response.error.message);
    }

    const rows = (response.data ?? []).map(mapTransactionRecord);
    if (!filters.search?.trim()) {
      return rows;
    }

    const needle = filters.search.trim().toLowerCase();
    return rows.filter((row) =>
      [
        row.description,
        row.category_label,
        row.subcategory ?? "",
        row.client?.nombre ?? "",
        row.supplier?.nombre ?? "",
        row.project?.nombre_proyecto ?? "",
        row.budget?.budget_number ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  },

  async getFormOptions() {
    return loadFormOptions();
  },

  async create(input: FinanceCreateInput): Promise<FinanceTransactionRecord> {
    const context = await getAuthorizedBrowserContext();
    const settings = await settingsService.getCurrent();

    const amount = Math.max(0, normalizeNumber(input.amount));
    const baseCurrency = normalizeString(settings.base_currency) ?? "ARS";
    const currency = normalizeString(input.currency) ?? baseCurrency;
    const exchangeRate = currency === baseCurrency ? 1 : Math.max(0.000001, normalizeNumber(input.exchange_rate_to_base, 1));
    const amountBase = roundAmount(amount * exchangeRate);

    const payload: FinancialTransactionInsert = {
      profile_id: context.userId,
      type: input.type,
      category_id: input.category_id,
      subcategory: normalizeString(input.subcategory),
      description: input.description.trim(),
      amount,
      currency,
      exchange_rate_to_base: exchangeRate,
      amount_base: amountBase,
      payment_method: normalizeString(input.payment_method),
      status: input.status ?? "pending",
      record_date: normalizeDate(input.record_date),
      client_id: normalizeString(input.client_id),
      supplier_id: normalizeString(input.supplier_id),
      custom_project_id: normalizeString(input.custom_project_id),
      budget_id: normalizeString(input.budget_id),
      job_id: normalizeString(input.job_id),
      purchase_id: normalizeString(input.purchase_id),
      source_module: normalizeString(input.source_module),
      source_type: normalizeString(input.source_type),
      source_id: normalizeString(input.source_id),
      notes: normalizeString(input.notes),
      created_by: context.userId,
      updated_by: context.userId,
    };

    const response = (await context.client
      .from(FINANCIAL_TRANSACTIONS_TABLE as never)
      .insert(payload as never)
      .select(FINANCIAL_SELECT)
      .single()) as QueryResponse<FinancialTransactionRowWithRelations>;

    if (response.error || !response.data) {
      throw new Error(response.error?.message || "No se pudo crear el movimiento financiero.");
    }

    return mapTransactionRecord(response.data);
  },

  async buildMonthlySummary(filters: FinanceListFilters): Promise<FinanceSummary> {
    const rows = await this.list(filters);
    return buildMonthlyFinanceSummary(rows.map(toMetricRecord), filters);
  },

  async createFromPurchase(purchaseId: string) {
    const context = await getAuthorizedBrowserContext();
    const purchaseResponse = (await context.client
      .from(PURCHASES_TABLE as never)
      .select("*")
      .eq("profile_id", context.userId)
      .eq("id", purchaseId)
      .maybeSingle()) as QueryResponse<PurchaseRow>;

    if (purchaseResponse.error || !purchaseResponse.data) {
      throw new Error(purchaseResponse.error?.message || "No se encontro la compra.");
    }

    if (purchaseResponse.data.financial_transaction_id) {
      const existing = await getTransactionById(purchaseResponse.data.financial_transaction_id);
      if (existing) {
        return existing;
      }
    }

    const categories = await ensureDefaultCategories();
    const materialsCategory = categories.find((category) => category.code === "expense_materials");
    if (!materialsCategory) {
      throw new Error("No se pudo resolver la categoria de compra de materiales.");
    }

    const transaction = await this.create({
      type: "expense",
      category_id: materialsCategory.id,
      description: `Compra ${purchaseResponse.data.id.slice(0, 8).toUpperCase()}`,
      amount: Number(purchaseResponse.data.total_snapshot || 0),
      currency: purchaseResponse.data.moneda,
      status: purchaseResponse.data.status === "purchased" ? "paid" : "pending",
      record_date: purchaseResponse.data.record_date,
      supplier_id: purchaseResponse.data.supplier_id,
      custom_project_id:
        purchaseResponse.data.source_type === "custom_project" ? purchaseResponse.data.source_id : null,
      job_id: purchaseResponse.data.source_type === "cut_job" ? purchaseResponse.data.source_id : null,
      purchase_id: purchaseResponse.data.id,
      source_module: "compras",
      source_type: purchaseResponse.data.source_type,
      source_id: purchaseResponse.data.source_id,
      notes: purchaseResponse.data.notas,
    });

    const updateResponse = (await context.client
      .from(PURCHASES_TABLE as never)
      .update(
        {
          financial_sync_status: "linked",
          financial_transaction_id: transaction.id,
          updated_by: context.userId,
        } as FinancialTransactionUpdate as never,
      )
      .eq("profile_id", context.userId)
      .eq("id", purchaseId)) as QueryResponse<PurchaseRow[]>;

    if (updateResponse.error) {
      throw new Error(updateResponse.error.message);
    }

    return transaction;
  },

  async createFromBudget(budgetId: string) {
    const context = await getAuthorizedBrowserContext();
    const budgetResponse = (await context.client
      .from(BUDGETS_TABLE as never)
      .select("*")
      .eq("profile_id", context.userId)
      .eq("id", budgetId)
      .maybeSingle()) as QueryResponse<BudgetRow>;

    if (budgetResponse.error || !budgetResponse.data) {
      throw new Error(budgetResponse.error?.message || "No se encontro el presupuesto.");
    }

    if (budgetResponse.data.financial_transaction_id) {
      const existing = await getTransactionById(budgetResponse.data.financial_transaction_id);
      if (existing) {
        return existing;
      }
    }

    const categories = await ensureDefaultCategories();
    const salesCategory = categories.find((category) => category.code === "income_sales");
    if (!salesCategory) {
      throw new Error("No se pudo resolver la categoria de ventas.");
    }

    const transaction = await this.create({
      type: "income",
      category_id: salesCategory.id,
      description: `Cobro presupuesto ${budgetResponse.data.budget_number ?? budgetResponse.data.id.slice(0, 8).toUpperCase()}`,
      amount: Number(budgetResponse.data.total_snapshot || 0),
      currency: budgetResponse.data.moneda,
      status: budgetResponse.data.estado === "approved" ? "collected" : "pending",
      record_date: budgetResponse.data.record_date,
      client_id: budgetResponse.data.client_id,
      custom_project_id: budgetResponse.data.custom_project_id,
      budget_id: budgetResponse.data.id,
      source_module: "presupuestos",
      source_type: "budget",
      source_id: budgetResponse.data.id,
      notes: null,
    });

    const updateResponse = (await context.client
      .from(BUDGETS_TABLE as never)
      .update(
        {
          financial_sync_status: "linked",
          financial_transaction_id: transaction.id,
          updated_by: context.userId,
        } as FinancialTransactionUpdate as never,
      )
      .eq("profile_id", context.userId)
      .eq("id", budgetId)) as QueryResponse<BudgetRow[]>;

    if (updateResponse.error) {
      throw new Error(updateResponse.error.message);
    }

    return transaction;
  },
};
