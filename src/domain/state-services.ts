import { calculateEcommerceTotals } from "@/domain/costing/ecommerce-cost";
import { calculateProjectTotals } from "@/domain/costing/project-cost";
import { optimizeCut } from "@/domain/cutting/optimizer";
import {
  AppState,
  Budget,
  BudgetLine,
  Client,
  CutPart,
  EcommerceProduct,
  JobBoardItem,
  JobStatus,
  Material,
  MaterialCategory,
  MaterialUnit,
  ProductMaterial,
  ProjectLabor,
  ProjectMaterial,
} from "@/lib/types";
import { createId, nowIso, round, todayIsoDate } from "@/lib/utils";

export interface MaterialCsvRow {
  codigo: string;
  nombre: string;
  categoria: MaterialCategory;
  unidad: MaterialUnit;
  costoUnitario: number;
  marca: string;
  espesorMm: number;
  largoMm: number;
  anchoMm: number;
  observaciones: string;
}

export interface ProjectDraftInput {
  id?: string;
  clientId: string;
  nombreProyecto: string;
  fecha: string;
  tipoMueble: string;
  ancho: number;
  alto: number;
  profundidad: number;
  cantidad: number;
  descuentoPct: number;
}

export interface ProjectMaterialInput {
  materialId: string;
  consumo: number;
  costoUnitarioSnapshot: number;
}

export interface ProjectLaborInput {
  proceso: ProjectLabor["proceso"];
  horas: number;
}

export interface EcommerceDraftInput {
  id?: string;
  sku: string;
  nombre: string;
  categoria: string;
  precioMercado: number;
  ancho: number;
  alto: number;
  profundidad: number;
  horasProcesoUnit: number;
  embalajeUnitario: number;
  envioUnitario: number;
}

export interface ProductMaterialInput {
  materialId: string;
  consumoUnit: number;
  costoUnitarioSnapshot: number;
}

export interface CutJobDraftInput {
  id?: string;
  nombre: string;
  largoPlaca: number;
  anchoPlaca: number;
  kerf: number;
  margenPerimetral: number;
  desperdicioExtra: number;
  allowRotationDefault: boolean;
  grainRequiredDefault: boolean;
}

export function upsertClient(state: AppState, input: Omit<Client, "id" | "createdAt"> & { id?: string }) {
  const id = input.id ?? createId();
  const existing = state.clients.find((row) => row.id === id);

  const nextClient: Client = {
    id,
    ...input,
    createdAt: existing?.createdAt ?? nowIso(),
  };

  return {
    ...state,
    clients: existing
      ? state.clients.map((row) => (row.id === id ? nextClient : row))
      : [nextClient, ...state.clients],
  };
}

export function deleteClient(state: AppState, clientId: string) {
  return {
    ...state,
    clients: state.clients.filter((row) => row.id !== clientId),
  };
}

export function upsertMaterial(
  state: AppState,
  input: Omit<Material, "id" | "createdAt" | "updatedAt" | "areaM2"> & { id?: string },
) {
  const id = input.id ?? createId();
  const existing = state.materials.find((row) => row.id === id);

  const areaM2 = round((input.largoMm * input.anchoMm) / 1_000_000, 4);
  const nextMaterial: Material = {
    id,
    ...input,
    areaM2,
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };

  const materialCostHistory = [...state.materialCostHistory];
  if (existing && existing.costoUnitario !== input.costoUnitario) {
    materialCostHistory.unshift({
      id: createId(),
      materialId: id,
      costoAnterior: existing.costoUnitario,
      costoNuevo: input.costoUnitario,
      changedAt: nowIso(),
    });
  }

  return {
    ...state,
    materials: existing
      ? state.materials.map((row) => (row.id === id ? nextMaterial : row))
      : [nextMaterial, ...state.materials],
    materialCostHistory,
  };
}

export function deleteMaterial(state: AppState, materialId: string) {
  return {
    ...state,
    materials: state.materials.filter((row) => row.id !== materialId),
    projectMaterials: state.projectMaterials.filter((row) => row.materialId !== materialId),
    productMaterials: state.productMaterials.filter((row) => row.materialId !== materialId),
    cutParts: state.cutParts.filter((row) => row.materialId !== materialId),
  };
}

export function toggleMaterialFavorite(state: AppState, materialId: string, favorito: boolean) {
  return {
    ...state,
    materials: state.materials.map((row) =>
      row.id === materialId
        ? {
            ...row,
            favorito,
            updatedAt: nowIso(),
          }
        : row,
    ),
  };
}

export function toggleMaterialActive(state: AppState, materialId: string, activo: boolean) {
  return {
    ...state,
    materials: state.materials.map((row) =>
      row.id === materialId
        ? {
            ...row,
            activo,
            updatedAt: nowIso(),
          }
        : row,
    ),
  };
}

export function importMaterialsFromCsv(state: AppState, rows: MaterialCsvRow[]) {
  const mapped: Material[] = rows.map((row) => ({
    id: createId(),
    codigo: row.codigo,
    nombre: row.nombre,
    categoria: row.categoria,
    unidad: row.unidad,
    costoUnitario: row.costoUnitario,
    proveedorId: null,
    marca: row.marca,
    espesorMm: row.espesorMm,
    largoMm: row.largoMm,
    anchoMm: row.anchoMm,
    areaM2: round((row.largoMm * row.anchoMm) / 1_000_000, 4),
    activo: true,
    favorito: false,
    observaciones: row.observaciones,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }));

  return {
    ...state,
    materials: [...mapped, ...state.materials],
  };
}

export function upsertProjectBundle(
  state: AppState,
  draft: ProjectDraftInput,
  materialRows: ProjectMaterialInput[],
  laborRows: ProjectLaborInput[],
) {
  const projectId = draft.id ?? createId();
  const existing = state.projectsCustom.find((row) => row.id === projectId);

  const projectMaterials: ProjectMaterial[] = materialRows.map((row) => ({
    id: createId(),
    projectId,
    materialId: row.materialId,
    consumo: row.consumo,
    costoUnitarioSnapshot: row.costoUnitarioSnapshot,
    subtotal: round(row.consumo * row.costoUnitarioSnapshot),
  }));

  const projectLabor: ProjectLabor[] = laborRows.map((row) => ({
    id: createId(),
    projectId,
    proceso: row.proceso,
    horas: row.horas,
  }));

  const totals = calculateProjectTotals(state.settings, projectMaterials, projectLabor);

  return {
    projectId,
    state: {
      ...state,
      projectsCustom: existing
        ? state.projectsCustom.map((row) =>
            row.id === projectId
              ? {
                  ...row,
                  ...draft,
                  ...totals,
                  utilidadEstimada: round(totals.precioSugerido - totals.costoTotal),
                  updatedAt: nowIso(),
                }
              : row,
          )
        : [
            {
              id: projectId,
              ...draft,
              ...totals,
              utilidadEstimada: round(totals.precioSugerido - totals.costoTotal),
              createdAt: nowIso(),
              updatedAt: nowIso(),
            },
            ...state.projectsCustom,
          ],
      projectMaterials: [
        ...state.projectMaterials.filter((row) => row.projectId !== projectId),
        ...projectMaterials,
      ],
      projectLabor: [...state.projectLabor.filter((row) => row.projectId !== projectId), ...projectLabor],
    },
  };
}

export function deleteProjectBundle(state: AppState, projectId: string) {
  return {
    ...state,
    projectsCustom: state.projectsCustom.filter((row) => row.id !== projectId),
    projectMaterials: state.projectMaterials.filter((row) => row.projectId !== projectId),
    projectLabor: state.projectLabor.filter((row) => row.projectId !== projectId),
  };
}

export function upsertEcommerceBundle(
  state: AppState,
  draft: EcommerceDraftInput,
  materialRows: ProductMaterialInput[],
) {
  const productId = draft.id ?? createId();
  const existing = state.ecommerceProducts.find((row) => row.id === productId);

  const productMaterials: ProductMaterial[] = materialRows.map((row) => ({
    id: createId(),
    productId,
    materialId: row.materialId,
    consumoUnit: row.consumoUnit,
    costoUnitarioSnapshot: row.costoUnitarioSnapshot,
    subtotalUnit: round(row.consumoUnit * row.costoUnitarioSnapshot),
  }));

  const totals = calculateEcommerceTotals({
    settings: state.settings,
    materiales: productMaterials,
    horasUnit: draft.horasProcesoUnit,
    precioMercado: draft.precioMercado,
    embalajeUnitario: draft.embalajeUnitario,
    envioUnitario: draft.envioUnitario,
  });

  const nextProduct: EcommerceProduct = {
    id: productId,
    ...draft,
    ...totals,
    createdAt: existing?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
  };

  return {
    productId,
    state: {
      ...state,
      ecommerceProducts: existing
        ? state.ecommerceProducts.map((row) => (row.id === productId ? nextProduct : row))
        : [nextProduct, ...state.ecommerceProducts],
      productMaterials: [
        ...state.productMaterials.filter((row) => row.productId !== productId),
        ...productMaterials,
      ],
    },
  };
}

export function deleteEcommerceBundle(state: AppState, productId: string) {
  return {
    ...state,
    ecommerceProducts: state.ecommerceProducts.filter((row) => row.id !== productId),
    productMaterials: state.productMaterials.filter((row) => row.productId !== productId),
  };
}

export function upsertCutJobBundle(
  state: AppState,
  draft: CutJobDraftInput,
  partRows: Array<Omit<CutPart, "cutJobId">>,
) {
  const cutJobId = draft.id ?? createId();
  const existing = state.cutJobs.find((row) => row.id === cutJobId);

  return {
    cutJobId,
    state: {
      ...state,
      cutJobs: existing
        ? state.cutJobs.map((row) =>
            row.id === cutJobId ? { ...row, ...draft, updatedAt: nowIso() } : row,
          )
        : [
            {
              id: cutJobId,
              ...draft,
              createdAt: nowIso(),
              updatedAt: nowIso(),
            },
            ...state.cutJobs,
          ],
      cutParts: [
        ...state.cutParts.filter((row) => row.cutJobId !== cutJobId),
        ...partRows.map((row) => ({ ...row, cutJobId })),
      ],
    },
  };
}

export function deleteCutJobBundle(state: AppState, cutJobId: string) {
  return {
    ...state,
    cutJobs: state.cutJobs.filter((row) => row.id !== cutJobId),
    cutParts: state.cutParts.filter((row) => row.cutJobId !== cutJobId),
    cutLayouts: state.cutLayouts.filter((row) => row.cutJobId !== cutJobId),
  };
}

export function optimizeCutJobFromState(state: AppState, cutJobId: string, iteration = 1) {
  const job = state.cutJobs.find((row) => row.id === cutJobId);
  if (!job) {
    return state;
  }

  const parts = state.cutParts.filter((row) => row.cutJobId === cutJobId);
  const layout = optimizeCut({
    job,
    parts,
    materials: state.materials,
    iteration,
  });

  return {
    ...state,
    cutLayouts: [layout, ...state.cutLayouts.filter((row) => row.cutJobId !== cutJobId)],
  };
}

export function createPurchaseFromProject(state: AppState, projectId: string) {
  const rows = state.projectMaterials.filter((item) => item.projectId === projectId);
  if (!rows.length) {
    return state;
  }

  const purchaseId = createId();
  const purchase: AppState["purchases"][number] = {
    id: purchaseId,
    origen: "proyecto",
    referenceId: projectId,
    fecha: todayIsoDate(),
    total: round(rows.reduce((acc, row) => acc + row.subtotal, 0)),
    status: "borrador",
    createdAt: nowIso(),
  };
  return {
    ...state,
    purchases: [purchase, ...state.purchases],
    purchaseItems: [
      ...rows.map((row) => {
        const material = state.materials.find((item) => item.id === row.materialId);
        return {
          id: createId(),
          purchaseId,
          materialId: row.materialId,
          cantidad: row.consumo,
          unidad: material?.unidad ?? "unidad",
          costoUnitarioSnapshot: row.costoUnitarioSnapshot,
          subtotal: row.subtotal,
          proveedorId: material?.proveedorId ?? null,
          comprado: false,
        };
      }),
      ...state.purchaseItems,
    ],
  };
}

export function createPurchaseFromCut(state: AppState, cutJobId: string) {
  const layout = state.cutLayouts.find((item) => item.cutJobId === cutJobId);
  if (!layout) {
    return state;
  }

  const grouped = new Map<string, number>();
  layout.layouts.forEach((board) => {
    grouped.set(board.materialId, (grouped.get(board.materialId) ?? 0) + 1);
  });

  const purchaseId = createId();
  const purchase: AppState["purchases"][number] = {
    id: purchaseId,
    origen: "corte",
    referenceId: cutJobId,
    fecha: todayIsoDate(),
    total: layout.totalBoardCost,
    status: "borrador",
    createdAt: nowIso(),
  };
  return {
    ...state,
    purchases: [purchase, ...state.purchases],
    purchaseItems: [
      ...Array.from(grouped.entries()).map(([materialId, qty]) => {
        const material = state.materials.find((item) => item.id === materialId);
        return {
          id: createId(),
          purchaseId,
          materialId,
          cantidad: qty,
          unidad: "unidad" as const,
          costoUnitarioSnapshot: material?.costoUnitario ?? 0,
          subtotal: round((material?.costoUnitario ?? 0) * qty),
          proveedorId: material?.proveedorId ?? null,
          comprado: false,
        };
      }),
      ...state.purchaseItems,
    ],
  };
}

export function togglePurchaseItemBought(state: AppState, purchaseItemId: string, comprado: boolean) {
  const purchaseItems = state.purchaseItems.map((item) =>
    item.id === purchaseItemId
      ? {
          ...item,
          comprado,
        }
      : item,
  );

  return {
    ...state,
    purchaseItems,
    purchases: state.purchases.map((purchase) => {
      const related = purchaseItems.filter((item) => item.purchaseId === purchase.id);
      const allBought = related.length > 0 && related.every((item) => item.comprado);
      return {
        ...purchase,
        status: allBought ? "completa" : purchase.status,
      };
    }),
  };
}

export function createBudgetFromProject(
  state: AppState,
  params: {
    clientId: string;
    projectId: string;
    validezDias: number;
    formaPago: string;
    extraLines?: BudgetLine[];
  },
) {
  const project = state.projectsCustom.find((item) => item.id === params.projectId);
  if (!project) {
    return state;
  }

  const lines: BudgetLine[] = [
    {
      id: createId(),
      concepto: "fabricacion",
      descripcion: `Fabricación ${project.nombreProyecto}`,
      monto: project.costoTotal,
    },
    {
      id: createId(),
      concepto: "instalacion",
      descripcion: "Instalación",
      monto: round(project.costoTotal * 0.1),
    },
    {
      id: createId(),
      concepto: "flete",
      descripcion: "Flete",
      monto: round(project.costoTotal * 0.04),
    },
    ...(params.extraLines ?? []),
  ];

  const total = round(lines.reduce((acc, line) => acc + line.monto, 0));
  const sena = round(total * 0.5);

  const budget: Budget = {
    id: createId(),
    clientId: params.clientId,
    projectId: params.projectId,
    ecommerceProductId: null,
    fecha: todayIsoDate(),
    validezDias: params.validezDias,
    formaPago: params.formaPago,
    lineas: lines,
    total,
    sena,
    saldo: round(total - sena),
    snapshot: {
      projectId: params.projectId,
      materiales: state.projectMaterials
        .filter((item) => item.projectId === params.projectId)
        .map((item) => ({
          nombre: state.materials.find((mat) => mat.id === item.materialId)?.nombre ?? item.materialId,
          costoUnitario: item.costoUnitarioSnapshot,
          consumo: item.consumo,
          subtotal: item.subtotal,
        })),
      procesos: state.projectLabor
        .filter((item) => item.projectId === params.projectId)
        .map((item) => ({
          proceso: item.proceso,
          horas: item.horas,
          costoHora: state.settings.costoHoraTaller,
          subtotal: round(item.horas * state.settings.costoHoraTaller),
        })),
      resumen: {
        subtotalMateriales: project.subtotalMateriales,
        manoObra: project.costoManoObra,
        costoDirecto: project.costoDirecto,
        costoTotal: project.costoTotal,
        margenAplicado: state.settings.margenMedidaPct,
        precioSugerido: project.precioSugerido,
      },
    },
    status: "borrador",
    createdAt: nowIso(),
  };

  return {
    ...state,
    budgets: [budget, ...state.budgets],
  };
}

export function createBudgetFromEcommerce(
  state: AppState,
  params: {
    clientId: string;
    productId: string;
    validezDias: number;
    formaPago: string;
  },
) {
  const product = state.ecommerceProducts.find((item) => item.id === params.productId);
  if (!product) {
    return state;
  }

  const total = round(product.precioSugerido);
  const sena = round(total * 0.4);
  const lineas: BudgetLine[] = [
    {
      id: createId(),
      concepto: "fabricacion",
      descripcion: product.nombre,
      monto: total,
    },
  ];
  const budget: Budget = {
    id: createId(),
    clientId: params.clientId,
    projectId: null,
    ecommerceProductId: params.productId,
    fecha: todayIsoDate(),
    validezDias: params.validezDias,
    formaPago: params.formaPago,
    lineas,
    total,
    sena,
    saldo: round(total - sena),
    snapshot: {
      ecommerceProductId: params.productId,
      materiales: state.productMaterials
        .filter((item) => item.productId === params.productId)
        .map((item) => ({
          nombre: state.materials.find((mat) => mat.id === item.materialId)?.nombre ?? item.materialId,
          costoUnitario: item.costoUnitarioSnapshot,
          consumo: item.consumoUnit,
          subtotal: item.subtotalUnit,
        })),
      procesos: [
        {
          proceso: "produccion",
          horas: product.horasProcesoUnit,
          costoHora: state.settings.costoHoraTaller,
          subtotal: round(product.horasProcesoUnit * state.settings.costoHoraTaller),
        },
      ],
      resumen: {
        subtotalMateriales: product.costoMaterialesUnit,
        manoObra: product.costoManoObraUnit,
        costoDirecto: product.costoBaseUnit,
        costoTotal: product.costoTotalCanal,
        margenAplicado: state.settings.margenEcommercePct,
        precioSugerido: product.precioSugerido,
      },
    },
    status: "borrador",
    createdAt: nowIso(),
  };

  return {
    ...state,
    budgets: [budget, ...state.budgets],
  };
}

export function setBudgetStatus(state: AppState, budgetId: string, status: Budget["status"]) {
  return {
    ...state,
    budgets: state.budgets.map((row) =>
      row.id === budgetId
        ? {
            ...row,
            status,
          }
        : row,
    ),
  };
}

export function createJobsBoardItem(
  state: AppState,
  payload: Omit<JobBoardItem, "id" | "updatedAt" | "saldo">,
) {
  return {
    ...state,
    jobsBoard: [
      {
        id: createId(),
        ...payload,
        saldo: round(payload.monto - payload.sena),
        updatedAt: nowIso(),
      },
      ...state.jobsBoard,
    ],
  };
}

export function moveJobsBoardStatus(state: AppState, id: string, status: JobStatus) {
  return {
    ...state,
    jobsBoard: state.jobsBoard.map((row) =>
      row.id === id
        ? {
            ...row,
            estado: status,
            updatedAt: nowIso(),
          }
        : row,
    ),
  };
}

