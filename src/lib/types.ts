export type ID = string;

export type MaterialCategory =
  | "placas"
  | "herrajes"
  | "perfiles"
  | "insumos"
  | "logistica"
  | "servicios";

export type MaterialUnit = "unidad" | "m2" | "m" | "kg" | "hora";

export type JobStatus =
  | "por_cotizar"
  | "presupuestado"
  | "aprobado"
  | "en_produccion"
  | "instalado"
  | "entregado"
  | "cobrado";

export interface User {
  id: ID;
  fullName: string;
  email: string;
  createdAt: string;
}

export interface Settings {
  id: ID;
  horasProductivasMes: number;
  costosFijosMes: number;
  costoHoraTaller: number;
  desperdicioMelaminaPct: number;
  margenMedidaPct: number;
  margenEcommercePct: number;
  impuestosPct: number;
  publicidadPct: number;
  comisionCobroPct: number;
  embalajePromedio: number;
  envioPromedio: number;
  kerfSierraMm: number;
  margenPerimetralPlacaMm: number;
  permitirRotacionPorDefecto: boolean;
  vetaObligatoriaPorDefecto: boolean;
  updatedAt: string;
}

export interface Client {
  id: ID;
  nombre: string;
  telefono: string;
  email: string;
  direccion: string;
  ciudad: string;
  provincia: string;
  notas: string;
  canalIngreso: string;
  fechaAlta: string;
  saldoPendiente: number;
  createdAt: string;
}

export interface Supplier {
  id: ID;
  nombre: string;
  telefono: string;
  email: string;
  ciudad: string;
  createdAt: string;
}

export interface MaterialCostHistory {
  id: ID;
  materialId: ID;
  costoAnterior: number;
  costoNuevo: number;
  changedAt: string;
}

export interface Material {
  id: ID;
  codigo: string;
  nombre: string;
  categoria: MaterialCategory;
  unidad: MaterialUnit;
  costoUnitario: number;
  proveedorId: ID | null;
  marca: string;
  espesorMm: number;
  largoMm: number;
  anchoMm: number;
  areaM2: number;
  activo: boolean;
  favorito: boolean;
  observaciones: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectCustom {
  id: ID;
  clientId: ID;
  nombreProyecto: string;
  fecha: string;
  tipoMueble: string;
  ancho: number;
  alto: number;
  profundidad: number;
  cantidad: number;
  descuentoPct: number;
  subtotalMateriales: number;
  horasTotales: number;
  costoManoObra: number;
  costoDirecto: number;
  costoTotal: number;
  precioSugerido: number;
  utilidadEstimada: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMaterial {
  id: ID;
  projectId: ID;
  materialId: ID;
  consumo: number;
  costoUnitarioSnapshot: number;
  subtotal: number;
}

export interface ProjectLabor {
  id: ID;
  projectId: ID;
  proceso:
    | "diseno"
    | "corte"
    | "enchapado"
    | "perforado"
    | "armado"
    | "instalacion";
  horas: number;
}

export interface EcommerceProduct {
  id: ID;
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
  costoMaterialesUnit: number;
  costoManoObraUnit: number;
  costoBaseUnit: number;
  costoConEmbalaje: number;
  costoTotalCanal: number;
  precioSugerido: number;
  gananciaUnit: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductMaterial {
  id: ID;
  productId: ID;
  materialId: ID;
  consumoUnit: number;
  costoUnitarioSnapshot: number;
  subtotalUnit: number;
}

export interface CutPart {
  id: ID;
  cutJobId: ID;
  pieza: string;
  cantidad: number;
  largo: number;
  ancho: number;
  materialId: ID;
  espesor: number;
  rotacionPermitida: boolean;
  vetaObligatoria: boolean;
  canto: string;
  observacion: string;
  bloqueada: boolean;
}

export interface CutPlacement {
  partId: ID;
  pieza: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
  grainArrow: "horizontal" | "vertical";
}

export interface CutBoardLayout {
  boardIndex: number;
  width: number;
  height: number;
  materialId: ID;
  espesor: number;
  placements: CutPlacement[];
  usedArea: number;
  wasteArea: number;
}

export interface CutLayout {
  id: ID;
  cutJobId: ID;
  iteration: number;
  utilizedPct: number;
  wastePct: number;
  boardsNeeded: number;
  totalBoardCost: number;
  layouts: CutBoardLayout[];
  createdAt: string;
}

export interface CutJob {
  id: ID;
  nombre: string;
  largoPlaca: number;
  anchoPlaca: number;
  kerf: number;
  margenPerimetral: number;
  desperdicioExtra: number;
  allowRotationDefault: boolean;
  grainRequiredDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetLine {
  id: ID;
  concepto: "fabricacion" | "instalacion" | "flete" | "descuento";
  descripcion: string;
  monto: number;
}

export interface BudgetSnapshot {
  projectId?: ID;
  ecommerceProductId?: ID;
  materiales: Array<{ nombre: string; costoUnitario: number; consumo: number; subtotal: number }>;
  procesos: Array<{ proceso: string; horas: number; costoHora: number; subtotal: number }>;
  resumen: {
    subtotalMateriales: number;
    manoObra: number;
    costoDirecto: number;
    costoTotal: number;
    margenAplicado: number;
    precioSugerido: number;
  };
}

export interface Budget {
  id: ID;
  clientId: ID;
  projectId: ID | null;
  ecommerceProductId: ID | null;
  fecha: string;
  validezDias: number;
  formaPago: string;
  lineas: BudgetLine[];
  total: number;
  sena: number;
  saldo: number;
  snapshot: BudgetSnapshot;
  status: "borrador" | "enviado" | "aprobado" | "rechazado";
  createdAt: string;
}

export interface PurchaseItem {
  id: ID;
  purchaseId: ID;
  materialId: ID;
  cantidad: number;
  unidad: MaterialUnit;
  costoUnitarioSnapshot: number;
  subtotal: number;
  proveedorId: ID | null;
  comprado: boolean;
}

export interface Purchase {
  id: ID;
  origen: "proyecto" | "corte" | "manual";
  referenceId: ID | null;
  fecha: string;
  total: number;
  status: "borrador" | "emitida" | "completa";
  createdAt: string;
}

export interface JobBoardItem {
  id: ID;
  projectId: ID | null;
  budgetId: ID | null;
  clientId: ID;
  nombreProyecto: string;
  monto: number;
  sena: number;
  saldo: number;
  fechaPrometida: string;
  avance: number;
  estado: JobStatus;
  updatedAt: string;
}

export interface FinancialRecord {
  id: ID;
  source: "custom_project" | "ecommerce_product";
  sourceId: ID;
  nombre: string;
  canal: "medida" | "ecommerce";
  costo: number;
  precio: number;
  margen: number;
  fecha: string;
}

export interface AppState {
  users: User[];
  settings: Settings;
  clients: Client[];
  suppliers: Supplier[];
  materials: Material[];
  materialCostHistory: MaterialCostHistory[];
  projectsCustom: ProjectCustom[];
  projectMaterials: ProjectMaterial[];
  projectLabor: ProjectLabor[];
  ecommerceProducts: EcommerceProduct[];
  productMaterials: ProductMaterial[];
  cutJobs: CutJob[];
  cutParts: CutPart[];
  cutLayouts: CutLayout[];
  budgets: Budget[];
  purchases: Purchase[];
  purchaseItems: PurchaseItem[];
  jobsBoard: JobBoardItem[];
  financialRecords: FinancialRecord[];
}

export interface KPI {
  title: string;
  value: number;
  unit?: "$" | "%" | "u";
  delta?: number;
}


