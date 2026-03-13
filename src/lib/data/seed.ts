import { calculateEcommerceTotals } from "@/domain/costing/ecommerce-cost";
import { calculateProjectTotals } from "@/domain/costing/project-cost";
import { createId, nowIso, round, todayIsoDate } from "@/lib/utils";
import {
  AppState,
  Budget,
  BudgetSnapshot,
  EcommerceProduct,
  Material,
  ProductMaterial,
  Purchase,
  PurchaseItem,
  ProjectCustom,
  JobBoardItem,
  FinancialRecord,
  ProjectLabor,
  ProjectMaterial,
  Settings,
} from "@/lib/types";

export function createDefaultSettings(): Settings {
  const horasProductivasMes = 176;
  const costosFijosMes = 3_200_000;

  return {
    id: createId(),
    horasProductivasMes,
    costosFijosMes,
    costoHoraTaller: round(costosFijosMes / horasProductivasMes),
    desperdicioMelaminaPct: 8,
    margenMedidaPct: 35,
    margenEcommercePct: 28,
    impuestosPct: 21,
    publicidadPct: 4,
    comisionCobroPct: 3.5,
    embalajePromedio: 8_000,
    envioPromedio: 12_000,
    kerfSierraMm: 3,
    margenPerimetralPlacaMm: 10,
    permitirRotacionPorDefecto: true,
    vetaObligatoriaPorDefecto: false,
    updatedAt: nowIso(),
  };
}

function createBudgetSnapshot(params: {
  projectId?: string;
  ecommerceProductId?: string;
  projectMaterials: ProjectMaterial[];
  projectLabor: ProjectLabor[];
  costoHora: number;
  totals: {
    subtotalMateriales: number;
    costoManoObra: number;
    costoDirecto: number;
    costoTotal: number;
    precioSugerido: number;
  };
}): BudgetSnapshot {
  return {
    projectId: params.projectId,
    ecommerceProductId: params.ecommerceProductId,
    materiales: params.projectMaterials.map((item) => ({
      nombre: item.materialId,
      costoUnitario: item.costoUnitarioSnapshot,
      consumo: item.consumo,
      subtotal: item.subtotal,
    })),
    procesos: params.projectLabor.map((item) => ({
      proceso: item.proceso,
      horas: item.horas,
      costoHora: params.costoHora,
      subtotal: round(item.horas * params.costoHora),
    })),
    resumen: {
      subtotalMateriales: params.totals.subtotalMateriales,
      manoObra: params.totals.costoManoObra,
      costoDirecto: params.totals.costoDirecto,
      costoTotal: params.totals.costoTotal,
      margenAplicado: params.totals.costoTotal
        ? round((params.totals.precioSugerido - params.totals.costoTotal) / params.totals.precioSugerido * 100)
        : 0,
      precioSugerido: params.totals.precioSugerido,
    },
  };
}

export function createSeedState(): AppState {
  const now = nowIso();
  const settings = createDefaultSettings();

  const users = [
    {
      id: createId(),
      fullName: "Ariel Carpi",
      email: "ariel@carpi.ar",
      createdAt: now,
    },
  ];

  const suppliers = [
    { id: createId(), nombre: "Melaminas Sur", telefono: "+54 11 4355-2000", email: "ventas@melaminassur.ar", ciudad: "CABA", createdAt: now },
    { id: createId(), nombre: "Herrajes Delta", telefono: "+54 11 4920-9900", email: "pedidos@herrajesdelta.ar", ciudad: "Lanus", createdAt: now },
    { id: createId(), nombre: "Logistica Mueblex", telefono: "+54 11 5002-4700", email: "operaciones@mueblex.ar", ciudad: "Avellaneda", createdAt: now },
  ];

  const clients = [
    {
      id: createId(),
      nombre: "Mariana Lopez",
      telefono: "+54 11 6789-1234",
      email: "mariana.lopez@gmail.com",
      direccion: "Av. Rivadavia 2330",
      ciudad: "CABA",
      provincia: "Buenos Aires",
      notas: "Cocina integral y bajo mesada",
      canalIngreso: "Instagram",
      fechaAlta: "2026-01-17",
      saldoPendiente: 120000,
      createdAt: now,
    },
    {
      id: createId(),
      nombre: "Santiago Perez",
      telefono: "+54 11 5555-9988",
      email: "sperez@yahoo.com",
      direccion: "Belgrano 122",
      ciudad: "La Plata",
      provincia: "Buenos Aires",
      notas: "Placard corredizo",
      canalIngreso: "Referido",
      fechaAlta: "2026-02-04",
      saldoPendiente: 0,
      createdAt: now,
    },
    {
      id: createId(),
      nombre: "Estudio Arq Norte",
      telefono: "+54 11 4455-8899",
      email: "compras@arqnorte.com",
      direccion: "Mitre 900",
      ciudad: "Vicente Lopez",
      provincia: "Buenos Aires",
      notas: "Proveedor recurrente de muebles comerciales",
      canalIngreso: "LinkedIn",
      fechaAlta: "2025-11-10",
      saldoPendiente: 540000,
      createdAt: now,
    },
  ];

  const melaminaRobleId = createId();
  const mdfBlancoId = createId();
  const cantoPvcId = createId();
  const bisagraId = createId();
  const correderaId = createId();
  const tornilloId = createId();
  const servicioLacaId = createId();

  const materials: Material[] = [
    {
      id: melaminaRobleId,
      codigo: "PLA-ROBLE-18",
      nombre: "Melamina Roble 18mm",
      categoria: "placas",
      unidad: "m2",
      costoUnitario: 19800,
      proveedorId: suppliers[0].id,
      marca: "Faplac",
      espesorMm: 18,
      largoMm: 2750,
      anchoMm: 1830,
      areaM2: round((2750 * 1830) / 1_000_000, 4),
      activo: true,
      favorito: true,
      observaciones: "Veta horizontal recomendada",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: mdfBlancoId,
      codigo: "PLA-MDF-15",
      nombre: "MDF Blanco 15mm",
      categoria: "placas",
      unidad: "m2",
      costoUnitario: 14500,
      proveedorId: suppliers[0].id,
      marca: "Arauco",
      espesorMm: 15,
      largoMm: 2600,
      anchoMm: 1830,
      areaM2: round((2600 * 1830) / 1_000_000, 4),
      activo: true,
      favorito: true,
      observaciones: "Ideal para interiores",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: cantoPvcId,
      codigo: "CAN-PVC-22",
      nombre: "Canto PVC 22mm",
      categoria: "insumos",
      unidad: "m",
      costoUnitario: 950,
      proveedorId: suppliers[1].id,
      marca: "Rehau",
      espesorMm: 1,
      largoMm: 50000,
      anchoMm: 22,
      areaM2: 0,
      activo: true,
      favorito: false,
      observaciones: "Color roble",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: bisagraId,
      codigo: "HER-BIS-35",
      nombre: "Bisagra cazoleta 35mm",
      categoria: "herrajes",
      unidad: "unidad",
      costoUnitario: 3200,
      proveedorId: suppliers[1].id,
      marca: "Hafele",
      espesorMm: 0,
      largoMm: 0,
      anchoMm: 0,
      areaM2: 0,
      activo: true,
      favorito: true,
      observaciones: "Cierre suave",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: correderaId,
      codigo: "HER-COR-450",
      nombre: "Corredera telescopica 45cm",
      categoria: "herrajes",
      unidad: "unidad",
      costoUnitario: 8900,
      proveedorId: suppliers[1].id,
      marca: "Ducasse",
      espesorMm: 0,
      largoMm: 450,
      anchoMm: 45,
      areaM2: 0,
      activo: true,
      favorito: false,
      observaciones: "Par por cajon",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: tornilloId,
      codigo: "INS-TOR-35",
      nombre: "Tornillo 3.5x16",
      categoria: "insumos",
      unidad: "unidad",
      costoUnitario: 38,
      proveedorId: suppliers[1].id,
      marca: "Fix",
      espesorMm: 0,
      largoMm: 16,
      anchoMm: 3.5,
      areaM2: 0,
      activo: true,
      favorito: false,
      observaciones: "Caja de 1000",
      createdAt: now,
      updatedAt: now,
    },
    {
      id: servicioLacaId,
      codigo: "SER-LACA",
      nombre: "Servicio de laqueado",
      categoria: "servicios",
      unidad: "m2",
      costoUnitario: 11800,
      proveedorId: suppliers[2].id,
      marca: "Externo",
      espesorMm: 0,
      largoMm: 0,
      anchoMm: 0,
      areaM2: 0,
      activo: true,
      favorito: false,
      observaciones: "Brillo satinado",
      createdAt: now,
      updatedAt: now,
    },
  ];

  const materialCostHistory = [
    {
      id: createId(),
      materialId: melaminaRobleId,
      costoAnterior: 18800,
      costoNuevo: 19800,
      changedAt: "2026-02-11T10:00:00.000Z",
    },
    {
      id: createId(),
      materialId: bisagraId,
      costoAnterior: 2890,
      costoNuevo: 3200,
      changedAt: "2026-01-29T10:00:00.000Z",
    },
  ];

  const projectId = createId();
  const projectMaterials: ProjectMaterial[] = [
    {
      id: createId(),
      projectId,
      materialId: melaminaRobleId,
      consumo: 9.4,
      costoUnitarioSnapshot: 19800,
      subtotal: round(9.4 * 19800),
    },
    {
      id: createId(),
      projectId,
      materialId: cantoPvcId,
      consumo: 26,
      costoUnitarioSnapshot: 950,
      subtotal: round(26 * 950),
    },
    {
      id: createId(),
      projectId,
      materialId: bisagraId,
      consumo: 8,
      costoUnitarioSnapshot: 3200,
      subtotal: round(8 * 3200),
    },
    {
      id: createId(),
      projectId,
      materialId: correderaId,
      consumo: 4,
      costoUnitarioSnapshot: 8900,
      subtotal: round(4 * 8900),
    },
  ];

  const projectLabor: ProjectLabor[] = [
    { id: createId(), projectId, proceso: "diseno", horas: 4 },
    { id: createId(), projectId, proceso: "corte", horas: 9 },
    { id: createId(), projectId, proceso: "enchapado", horas: 6 },
    { id: createId(), projectId, proceso: "perforado", horas: 2 },
    { id: createId(), projectId, proceso: "armado", horas: 8 },
    { id: createId(), projectId, proceso: "instalacion", horas: 5 },
  ];

  const projectTotals = calculateProjectTotals(settings, projectMaterials, projectLabor);

  const projectsCustom: ProjectCustom[] = [
    {
      id: projectId,
      clientId: clients[0].id,
      nombreProyecto: "Cocina Integral Lopez",
      fecha: "2026-03-03",
      tipoMueble: "Cocina",
      ancho: 3200,
      alto: 2400,
      profundidad: 600,
      cantidad: 1,
      descuentoPct: 0,
      ...projectTotals,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const ecommerceProductId = createId();
  const productMaterials: ProductMaterial[] = [
    {
      id: createId(),
      productId: ecommerceProductId,
      materialId: mdfBlancoId,
      consumoUnit: 1.8,
      costoUnitarioSnapshot: 14500,
      subtotalUnit: round(1.8 * 14500),
    },
    {
      id: createId(),
      productId: ecommerceProductId,
      materialId: tornilloId,
      consumoUnit: 40,
      costoUnitarioSnapshot: 38,
      subtotalUnit: round(40 * 38),
    },
  ];

  const ecommerceTotals = calculateEcommerceTotals({
    settings,
    materiales: productMaterials,
    horasUnit: 2.5,
    precioMercado: 125000,
    embalajeUnitario: 5000,
    envioUnitario: 7000,
  });

  const ecommerceProducts: EcommerceProduct[] = [
    {
      id: ecommerceProductId,
      sku: "ECO-RACK-120",
      nombre: "Rack TV Minimal 120",
      categoria: "Living",
      precioMercado: 125000,
      ancho: 1200,
      alto: 500,
      profundidad: 400,
      horasProcesoUnit: 2.5,
      embalajeUnitario: 5000,
      envioUnitario: 7000,
      ...ecommerceTotals,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const cutJobId = createId();
  const cutJobs = [
    {
      id: cutJobId,
      nombre: "Corte Cocina Lopez",
      largoPlaca: 2750,
      anchoPlaca: 1830,
      kerf: settings.kerfSierraMm,
      margenPerimetral: settings.margenPerimetralPlacaMm,
      desperdicioExtra: settings.desperdicioMelaminaPct,
      allowRotationDefault: settings.permitirRotacionPorDefecto,
      grainRequiredDefault: settings.vetaObligatoriaPorDefecto,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const cutParts = [
    {
      id: createId(),
      cutJobId,
      pieza: "Lateral bajo mesada",
      cantidad: 4,
      largo: 720,
      ancho: 560,
      materialId: melaminaRobleId,
      espesor: 18,
      rotacionPermitida: true,
      vetaObligatoria: false,
      canto: "2L",
      observacion: "",
      bloqueada: false,
    },
    {
      id: createId(),
      cutJobId,
      pieza: "Estante interno",
      cantidad: 6,
      largo: 560,
      ancho: 450,
      materialId: melaminaRobleId,
      espesor: 18,
      rotacionPermitida: true,
      vetaObligatoria: false,
      canto: "1L",
      observacion: "",
      bloqueada: false,
    },
    {
      id: createId(),
      cutJobId,
      pieza: "Puerta superior",
      cantidad: 6,
      largo: 710,
      ancho: 390,
      materialId: melaminaRobleId,
      espesor: 18,
      rotacionPermitida: false,
      vetaObligatoria: true,
      canto: "4L",
      observacion: "Respetar veta",
      bloqueada: false,
    },
  ];

  const budgetSnapshot = createBudgetSnapshot({
    projectId,
    projectMaterials,
    projectLabor,
    costoHora: settings.costoHoraTaller,
    totals: {
      subtotalMateriales: projectTotals.subtotalMateriales,
      costoManoObra: projectTotals.costoManoObra,
      costoDirecto: projectTotals.costoDirecto,
      costoTotal: projectTotals.costoTotal,
      precioSugerido: projectTotals.precioSugerido,
    },
  });

  const budget: Budget = {
    id: createId(),
    clientId: clients[0].id,
    projectId,
    ecommerceProductId: null,
    fecha: todayIsoDate(),
    validezDias: 15,
    formaPago: "50% anticipo + saldo contra entrega",
    lineas: [
      { id: createId(), concepto: "fabricacion", descripcion: "Fabricación y armado", monto: projectTotals.costoTotal },
      { id: createId(), concepto: "instalacion", descripcion: "Instalación in situ", monto: 120000 },
      { id: createId(), concepto: "flete", descripcion: "Flete e izaje", monto: 45000 },
      { id: createId(), concepto: "descuento", descripcion: "Descuento comercial", monto: -35000 },
    ],
    total: round(projectTotals.costoTotal + 120000 + 45000 - 35000),
    sena: round((projectTotals.costoTotal + 120000 + 45000 - 35000) * 0.5),
    saldo: round((projectTotals.costoTotal + 120000 + 45000 - 35000) * 0.5),
    snapshot: budgetSnapshot,
    status: "enviado",
    createdAt: now,
  };

  const purchases: Purchase[] = [
    {
      id: createId(),
      origen: "proyecto",
      referenceId: projectId,
      fecha: todayIsoDate(),
      total: round(projectMaterials.reduce((acc, item) => acc + item.subtotal, 0)),
      status: "emitida",
      createdAt: now,
    },
  ];

  const purchaseItems: PurchaseItem[] = projectMaterials.map((item) => {
    const material = materials.find((m) => m.id === item.materialId);
    return {
      id: createId(),
      purchaseId: purchases[0].id,
      materialId: item.materialId,
      cantidad: item.consumo,
      unidad: material?.unidad ?? "unidad",
      costoUnitarioSnapshot: item.costoUnitarioSnapshot,
      subtotal: item.subtotal,
      proveedorId: material?.proveedorId ?? null,
      comprado: false,
    };
  });

  const jobsBoard: JobBoardItem[] = [
    {
      id: createId(),
      projectId,
      budgetId: budget.id,
      clientId: clients[0].id,
      nombreProyecto: projectsCustom[0].nombreProyecto,
      monto: budget.total,
      sena: budget.sena,
      saldo: budget.saldo,
      fechaPrometida: "2026-04-15",
      avance: 35,
      estado: "en_produccion",
      updatedAt: now,
    },
    {
      id: createId(),
      projectId: null,
      budgetId: null,
      clientId: clients[1].id,
      nombreProyecto: "Placard frente espejo",
      monto: 980000,
      sena: 0,
      saldo: 980000,
      fechaPrometida: "2026-03-30",
      avance: 0,
      estado: "por_cotizar",
      updatedAt: now,
    },
  ];

  const financialRecords: FinancialRecord[] = [
    {
      id: createId(),
      source: "custom_project",
      sourceId: projectId,
      nombre: projectsCustom[0].nombreProyecto,
      canal: "medida",
      costo: projectsCustom[0].costoTotal,
      precio: budget.total,
      margen: round((budget.total - projectsCustom[0].costoTotal) / budget.total * 100),
      fecha: budget.fecha,
    },
    {
      id: createId(),
      source: "ecommerce_product",
      sourceId: ecommerceProductId,
      nombre: ecommerceProducts[0].nombre,
      canal: "ecommerce",
      costo: ecommerceProducts[0].costoTotalCanal,
      precio: ecommerceProducts[0].precioMercado,
      margen: round((ecommerceProducts[0].precioMercado - ecommerceProducts[0].costoTotalCanal) / ecommerceProducts[0].precioMercado * 100),
      fecha: todayIsoDate(),
    },
  ];

  return {
    users,
    settings,
    clients,
    suppliers,
    materials,
    materialCostHistory,
    projectsCustom,
    projectMaterials,
    projectLabor,
    ecommerceProducts,
    productMaterials,
    cutJobs,
    cutParts,
    cutLayouts: [],
    budgets: [budget],
    purchases,
    purchaseItems,
    jobsBoard,
    financialRecords,
  };
}


