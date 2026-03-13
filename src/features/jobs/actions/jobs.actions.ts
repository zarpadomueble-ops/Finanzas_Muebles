import { budgetsService } from "@/services/budgets";
import { clientsService } from "@/services/clients";
import { jobsBoardService } from "@/services/jobs-board";
import { projectsService } from "@/services/projects";
import type { JobBoardFormInput, JobsQueryInput } from "../schemas";
import type { JobBoardRecord, JobBudgetOption, JobClientOption, JobProjectOption } from "../types";

function normalizeString(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function plusDays(dateIso: string, days: number) {
  const date = new Date(dateIso);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function computeBalance(monto: number, sena: number) {
  return Math.max(0, Number(monto || 0) - Number(sena || 0));
}

function mapPayload(input: JobBoardFormInput) {
  return {
    client_id: input.client_id.trim(),
    custom_project_id: normalizeString(input.custom_project_id),
    budget_id: normalizeString(input.budget_id),
    titulo: input.titulo.trim(),
    estado: input.estado,
    monto_snapshot: Number(input.monto_snapshot || 0),
    sena_snapshot: Number(input.sena_snapshot || 0),
    saldo_snapshot: computeBalance(input.monto_snapshot, input.sena_snapshot),
    fecha_prometida: normalizeString(input.fecha_prometida),
    fecha_inicio: normalizeString(input.fecha_inicio),
    fecha_entrega: normalizeString(input.fecha_entrega),
    avance_pct: Number(input.avance_pct || 0),
    prioridad: Number(input.prioridad || 3),
    notas: input.notas.trim(),
  };
}

export function createEmptyJobFormInput(clientId = ""): JobBoardFormInput {
  const today = new Date().toISOString().slice(0, 10);

  return {
    client_id: clientId,
    custom_project_id: "",
    budget_id: "",
    titulo: "",
    estado: "por_cotizar",
    monto_snapshot: 0,
    sena_snapshot: 0,
    fecha_prometida: plusDays(today, 7),
    fecha_inicio: "",
    fecha_entrega: "",
    avance_pct: 0,
    prioridad: 3,
    notas: "",
  };
}

export function mapJobBoardDetailToFormInput(detail: Awaited<ReturnType<typeof jobsBoardService.getDetail>>): JobBoardFormInput {
  if (!detail) {
    return createEmptyJobFormInput();
  }

  return {
    id: detail.job.id,
    client_id: detail.job.client_id ?? "",
    custom_project_id: detail.job.custom_project_id ?? "",
    budget_id: detail.job.budget_id ?? "",
    titulo: detail.job.titulo ?? "",
    estado: detail.job.estado,
    monto_snapshot: Number(detail.job.monto_snapshot || 0),
    sena_snapshot: Number(detail.job.sena_snapshot || 0),
    fecha_prometida: detail.job.fecha_prometida ?? "",
    fecha_inicio: detail.job.fecha_inicio ?? "",
    fecha_entrega: detail.job.fecha_entrega ?? "",
    avance_pct: Number(detail.job.avance_pct || 0),
    prioridad: Number(detail.job.prioridad || 3),
    notas: detail.job.notas ?? "",
  };
}

export function applyBudgetOptionToForm(input: JobBoardFormInput, budget: JobBudgetOption): JobBoardFormInput {
  return {
    ...input,
    client_id: budget.client_id ?? input.client_id,
    custom_project_id: budget.custom_project_id ?? input.custom_project_id,
    budget_id: budget.id,
    titulo: budget.project_nombre || input.titulo || budget.budget_number,
    estado: input.estado === "por_cotizar" ? "presupuestado" : input.estado,
    monto_snapshot: budget.total_snapshot,
    sena_snapshot: budget.sena_snapshot,
  };
}

export function applyProjectOptionToForm(input: JobBoardFormInput, project: JobProjectOption): JobBoardFormInput {
  return {
    ...input,
    client_id: project.client_id ?? input.client_id,
    custom_project_id: project.id,
    titulo: input.titulo || project.nombre,
  };
}

export async function listJobsBoardRecords(filters: Partial<JobsQueryInput> = {}) {
  return jobsBoardService.list({
    search: filters.search,
    status: filters.status,
    client_id: filters.client_id,
    include_deleted: filters.include_deleted ?? false,
  });
}

export async function getJobBoardDetailRecord(jobId: string) {
  return jobsBoardService.getDetail(jobId);
}

export async function createJobBoardRecord(input: JobBoardFormInput) {
  return jobsBoardService.create(mapPayload(input));
}

export async function updateJobBoardRecord(jobId: string, input: JobBoardFormInput) {
  return jobsBoardService.update(jobId, mapPayload(input));
}

export async function updateJobBoardStatusRecord(jobId: string, status: JobBoardRecord["estado"]) {
  return jobsBoardService.updateStatus(jobId, status);
}

export async function listJobClientOptions(): Promise<JobClientOption[]> {
  const clients = await clientsService.list({ include_deleted: false });

  return clients
    .map((client) => ({
      id: client.id,
      nombre: client.nombre,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export async function listJobProjectOptions(): Promise<JobProjectOption[]> {
  const projects = await projectsService.list({ include_deleted: false });

  return projects
    .map((project) => ({
      id: project.id,
      nombre: project.nombre_proyecto,
      client_id: project.client_id,
      client_nombre: project.client?.nombre ?? null,
      status: project.status,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

export async function listJobBudgetOptions(): Promise<JobBudgetOption[]> {
  const budgets = await budgetsService.list({ include_deleted: false });

  return budgets
    .map((budget) => ({
      id: budget.id,
      budget_number: budget.budget_number || budget.id.slice(0, 8),
      client_id: budget.client_id,
      client_nombre: budget.client?.nombre ?? null,
      custom_project_id: budget.custom_project_id,
      project_nombre: budget.project?.nombre_proyecto ?? budget.costs_snapshot_data?.source_label ?? null,
      total_snapshot: Number(budget.total_snapshot || 0),
      sena_snapshot: Number(budget.sena_snapshot || 0),
      saldo_snapshot: Number(budget.saldo_snapshot || 0),
      status: budget.estado,
    }))
    .sort((a, b) => b.id.localeCompare(a.id));
}
