import { jsPDF } from "jspdf";
import {
  calculateBudgetProfitability,
  calculateBudgetSummary,
  type BudgetDiscountType,
} from "@/domain/costing";
import { buildBudgetWhatsAppText } from "@/domain/budgets";
import { clientsService } from "@/services/clients";
import { projectsService } from "@/services/projects";
import { budgetsService } from "@/services/budgets";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { BudgetBundleFormInput, BudgetsQueryInput } from "../schemas";
import type {
  BudgetClientOption,
  BudgetPreviewRecord,
  BudgetProjectOption,
  BudgetSourceContext,
} from "../types";

function normalizeString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeDateValue(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.includes("T") ? value.slice(0, 10) : value;
}

function plusDays(dateIso: string, days: number) {
  const date = new Date(dateIso);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function mapBudgetPayload(input: BudgetBundleFormInput, params: { budgetId?: string } = {}) {
  return {
    budget: {
      id: params.budgetId ?? input.id,
      client_id: input.client_id.trim(),
      custom_project_id: normalizeString(input.custom_project_id),
      source_label: normalizeString(input.source_label),
      fecha_emision: normalizeDateValue(input.fecha_emision),
      fecha_validez: normalizeString(input.fecha_validez),
      forma_pago: input.forma_pago.trim(),
      estado: input.estado,
      moneda: input.moneda.trim(),
      descuento_tipo: input.descuento_tipo,
      descuento_valor: Number(input.descuento_valor || 0),
      sena: Number(input.sena || 0),
      notas: input.notas.trim(),
    },
    items: input.items.map((line) => ({
      concepto: line.concepto,
      descripcion: line.descripcion.trim(),
      cantidad: Number(line.cantidad || 0),
      precio_unitario: Number(line.precio_unitario || 0),
    })),
  };
}

export function createEmptyBudgetFormInput(): BudgetBundleFormInput {
  const today = new Date().toISOString().slice(0, 10);

  return {
    client_id: "",
    custom_project_id: "",
    source_label: "",
    fecha_emision: today,
    fecha_validez: plusDays(today, 15),
    forma_pago: "50% de sena y saldo contra entrega",
    estado: "draft",
    moneda: "ARS",
    descuento_tipo: "fixed",
    descuento_valor: 0,
    sena: 0,
    notas: "",
    items: [
      {
        concepto: "fabricacion",
        descripcion: "Linea principal",
        cantidad: 1,
        precio_unitario: 0,
      },
    ],
  };
}

export function applyBudgetProjectDraftToForm(
  input: BudgetBundleFormInput,
  draft: Awaited<ReturnType<typeof budgetsService.buildFromProject>>,
): BudgetBundleFormInput {
  return {
    ...input,
    client_id: draft.client_id,
    custom_project_id: draft.custom_project_id,
    source_label: draft.source_label,
    items: draft.lines.map((line) => ({
      concepto: line.concepto,
      descripcion: line.descripcion,
      cantidad: line.cantidad,
      precio_unitario: line.precio_unitario,
    })),
  };
}

export function mapBudgetDetailToFormInput(
  detail: Awaited<ReturnType<typeof budgetsService.getDetail>>,
): BudgetBundleFormInput {
  if (!detail) {
    return createEmptyBudgetFormInput();
  }

  return {
    id: detail.budget.id,
    client_id: detail.budget.client_id ?? "",
    custom_project_id: detail.budget.custom_project_id ?? "",
    source_label: detail.budget.costs_snapshot_data?.source_label ?? "",
    fecha_emision: normalizeDateValue(detail.budget.fecha_emision),
    fecha_validez: normalizeDateValue(detail.budget.fecha_validez),
    forma_pago: detail.budget.terms_snapshot_data?.payment_method ?? detail.budget.forma_pago ?? "",
    estado: detail.budget.estado,
    moneda: detail.budget.moneda,
    descuento_tipo: detail.budget.pricing_snapshot_data?.discount_type ?? "fixed",
    descuento_valor: Number(detail.budget.pricing_snapshot_data?.discount_value ?? 0),
    sena: Number(detail.budget.sena_snapshot || 0),
    notas: detail.budget.terms_snapshot_data?.notes ?? "",
    items: detail.items.map((line) => ({
      concepto: line.concepto as BudgetBundleFormInput["items"][number]["concepto"],
      descripcion: line.descripcion,
      cantidad: Number(line.cantidad || 0),
      precio_unitario: Number(line.precio_unitario_snapshot || 0),
    })),
  };
}

export function createBudgetSourceContextFromProjectDraft(
  draft: Awaited<ReturnType<typeof budgetsService.buildFromProject>>,
): BudgetSourceContext {
  return {
    sourceType: "custom_project",
    sourceLabel: draft.source_label,
    sourceCostTotal: draft.source_cost_total,
    sourceCostSnapshot: draft.source_cost_snapshot,
  };
}

export function createBudgetSourceContextFromDetail(
  detail: Awaited<ReturnType<typeof budgetsService.getDetail>>,
): BudgetSourceContext | null {
  if (!detail?.budget.costs_snapshot_data) {
    return null;
  }

  return {
    sourceType: detail.budget.costs_snapshot_data.source === "custom_project" ? "custom_project" : "manual",
    sourceLabel: detail.budget.costs_snapshot_data.source_label ?? "",
    sourceCostTotal: detail.budget.costs_snapshot_data.source_cost_total,
    sourceCostSnapshot: detail.budget.costs_snapshot_data.source_cost_snapshot,
  };
}

export function calculateBudgetPreviewFromForm(
  input: BudgetBundleFormInput,
  sourceContext: BudgetSourceContext | null,
): BudgetPreviewRecord {
  const summary = calculateBudgetSummary({
    lines: input.items.map((line) => ({
      concepto: line.concepto,
      descripcion: line.descripcion,
      cantidad: line.cantidad,
      precioUnitario: line.precio_unitario,
    })),
    senia: input.sena,
    discountType: input.descuento_tipo as BudgetDiscountType,
    discountValue: input.descuento_valor,
  });

  return {
    summary,
    profitability:
      sourceContext && sourceContext.sourceCostTotal > 0
        ? calculateBudgetProfitability({
            price: summary.total,
            totalCost: sourceContext.sourceCostTotal,
          })
        : null,
  };
}

export async function listBudgetRecords(filters: Partial<BudgetsQueryInput> = {}) {
  return budgetsService.list({
    search: filters.search,
    status: filters.status,
    client_id: filters.client_id,
    include_deleted: filters.include_deleted ?? false,
  });
}

export async function getBudgetDetailRecord(budgetId: string) {
  return budgetsService.getDetail(budgetId);
}

export async function prepareBudgetFromProjectRecord(projectId: string) {
  return budgetsService.buildFromProject(projectId);
}

export async function createBudgetBundleRecord(input: BudgetBundleFormInput) {
  return budgetsService.saveBundle(mapBudgetPayload(input, { budgetId: undefined }));
}

export async function updateBudgetBundleRecord(budgetId: string, input: BudgetBundleFormInput) {
  return budgetsService.saveBundle(mapBudgetPayload(input, { budgetId }));
}

export async function listBudgetClientOptions(): Promise<BudgetClientOption[]> {
  const clients = await clientsService.list({ include_deleted: false });

  return clients
    .map((client) => ({
      id: client.id,
      nombre: client.nombre,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export async function listBudgetProjectOptions(): Promise<BudgetProjectOption[]> {
  const projects = await projectsService.list({ include_deleted: false });

  return projects.map((project) => ({
    id: project.id,
    nombre: project.nombre_proyecto,
    client_id: project.client_id,
    client_nombre: project.client?.nombre ?? null,
    precio_referencia: Number(project.precio_evaluado || project.precio_sugerido || 0),
    costo_total: Number(project.costo_total || 0),
    status: project.status,
  }));
}

export function buildBudgetWhatsappPreviewText(params: {
  form: BudgetBundleFormInput;
  preview: BudgetPreviewRecord;
  clientName: string;
}) {
  return buildBudgetWhatsAppText({
    budgetNumber: params.form.id ?? null,
    clientName: params.clientName,
    issueDate: params.form.fecha_emision,
    validUntil: normalizeString(params.form.fecha_validez),
    paymentMethod: normalizeString(params.form.forma_pago),
    notes: normalizeString(params.form.notas),
    subtotal: params.preview.summary.subtotal,
    discountAmount: params.preview.summary.discountAmount,
    total: params.preview.summary.total,
    deposit: params.preview.summary.senia,
    balance: params.preview.summary.saldo,
    lines: params.preview.summary.lines.map((line) => ({
      description: line.descripcion,
      quantity: line.cantidad,
      unitPrice: line.precioUnitario,
      total: line.subtotal,
    })),
  });
}

export function exportBudgetPdfPreview(params: {
  form: BudgetBundleFormInput;
  preview: BudgetPreviewRecord;
  clientName: string;
  sourceLabel: string;
}) {
  const doc = new jsPDF();
  const lines = params.preview.summary.lines;

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text("Presupuesto", 14, 18);

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text(`Cliente: ${params.clientName}`, 14, 38);
  doc.text(`Fecha: ${formatDate(params.form.fecha_emision)}`, 14, 44);
  doc.text(`Validez: ${params.form.fecha_validez ? formatDate(params.form.fecha_validez) : "-"}`, 14, 50);
  doc.text(`Origen: ${params.sourceLabel || "Manual"}`, 14, 56);

  let y = 70;
  doc.setFillColor(241, 245, 249);
  doc.rect(14, y - 6, 182, 8, "F");
  doc.text("Concepto", 16, y);
  doc.text("Cant.", 110, y);
  doc.text("P. unit.", 140, y, { align: "right" });
  doc.text("Subtotal", 194, y, { align: "right" });
  y += 8;

  lines.forEach((line) => {
    doc.text(line.descripcion, 16, y);
    doc.text(String(line.cantidad), 110, y);
    doc.text(formatCurrency(line.precioUnitario), 140, y, { align: "right" });
    doc.text(formatCurrency(line.subtotal), 194, y, { align: "right" });
    y += 7;
  });

  y += 6;
  doc.text(`Subtotal: ${formatCurrency(params.preview.summary.subtotal)}`, 194, y, { align: "right" });
  y += 6;
  if (params.preview.summary.discountAmount > 0) {
    doc.text(`Descuento: ${formatCurrency(params.preview.summary.discountAmount)}`, 194, y, { align: "right" });
    y += 6;
  }
  doc.setFontSize(12);
  doc.text(`Total: ${formatCurrency(params.preview.summary.total)}`, 194, y, { align: "right" });
  y += 7;
  doc.setFontSize(10);
  doc.text(`Sena: ${formatCurrency(params.preview.summary.senia)}`, 194, y, { align: "right" });
  y += 6;
  doc.text(`Saldo: ${formatCurrency(params.preview.summary.saldo)}`, 194, y, { align: "right" });

  y += 14;
  doc.text(`Forma de pago: ${params.form.forma_pago || "-"}`, 14, y);
  y += 6;
  doc.text(`Notas: ${params.form.notas || "-"}`, 14, y, {
    maxWidth: 182,
  });

  doc.save(`presupuesto-${(params.form.id ?? "nuevo").slice(0, 8)}.pdf`);
}
