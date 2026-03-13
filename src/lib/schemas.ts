import { z } from "zod";

export const settingsSchema = z.object({
  horasProductivasMes: z.number().min(1),
  costosFijosMes: z.number().min(0),
  desperdicioMelaminaPct: z.number().min(0).max(100),
  margenMedidaPct: z.number().min(0).max(100),
  margenEcommercePct: z.number().min(0).max(100),
  impuestosPct: z.number().min(0).max(100),
  publicidadPct: z.number().min(0).max(100),
  comisionCobroPct: z.number().min(0).max(100),
  embalajePromedio: z.number().min(0),
  envioPromedio: z.number().min(0),
  kerfSierraMm: z.number().min(0),
  margenPerimetralPlacaMm: z.number().min(0),
  permitirRotacionPorDefecto: z.boolean(),
  vetaObligatoriaPorDefecto: z.boolean(),
});

export const clientSchema = z.object({
  nombre: z.string().min(2),
  telefono: z.string().default(""),
  email: z.string().email().or(z.literal("")),
  direccion: z.string().default(""),
  ciudad: z.string().default(""),
  provincia: z.string().default(""),
  notas: z.string().default(""),
  canalIngreso: z.string().default(""),
  fechaAlta: z.string(),
});

export const supplierSchema = z.object({
  nombre: z.string().min(2),
  telefono: z.string().default(""),
  email: z.string().email().or(z.literal("")),
  ciudad: z.string().default(""),
});

export const materialSchema = z.object({
  codigo: z.string().min(1),
  nombre: z.string().min(2),
  categoria: z.enum(["placas", "herrajes", "perfiles", "insumos", "logistica", "servicios"]),
  unidad: z.enum(["unidad", "m2", "m", "kg", "hora"]),
  costoUnitario: z.number().min(0),
  proveedorId: z.string().nullable(),
  marca: z.string().default(""),
  espesorMm: z.number().min(0),
  largoMm: z.number().min(0),
  anchoMm: z.number().min(0),
  activo: z.boolean(),
  favorito: z.boolean(),
  observaciones: z.string().default(""),
});

export const projectSchema = z.object({
  clientId: z.string().min(1),
  nombreProyecto: z.string().min(2),
  fecha: z.string(),
  tipoMueble: z.string().min(2),
  ancho: z.number().min(1),
  alto: z.number().min(1),
  profundidad: z.number().min(1),
  cantidad: z.number().min(1),
  descuentoPct: z.number().min(0).max(100),
});

export const ecommerceSchema = z.object({
  sku: z.string().min(1),
  nombre: z.string().min(2),
  categoria: z.string().min(2),
  precioMercado: z.number().min(0),
  ancho: z.number().min(1),
  alto: z.number().min(1),
  profundidad: z.number().min(1),
  embalajeUnitario: z.number().min(0),
  envioUnitario: z.number().min(0),
});

export const cutPartSchema = z.object({
  pieza: z.string().min(1),
  cantidad: z.number().int().min(1),
  largo: z.number().min(1),
  ancho: z.number().min(1),
  materialId: z.string().min(1),
  espesor: z.number().min(1),
  rotacionPermitida: z.boolean(),
  vetaObligatoria: z.boolean(),
  canto: z.string().default(""),
  observacion: z.string().default(""),
});

export const cutJobSchema = z.object({
  nombre: z.string().min(1),
  largoPlaca: z.number().min(100),
  anchoPlaca: z.number().min(100),
  kerf: z.number().min(0),
  margenPerimetral: z.number().min(0),
  desperdicioExtra: z.number().min(0).max(100),
  allowRotationDefault: z.boolean(),
  grainRequiredDefault: z.boolean(),
});

export const budgetSchema = z.object({
  clientId: z.string().min(1),
  projectId: z.string().nullable(),
  ecommerceProductId: z.string().nullable(),
  fecha: z.string(),
  validezDias: z.number().min(1).max(120),
  formaPago: z.string().min(2),
  sena: z.number().min(0),
});

export const purchaseSchema = z.object({
  origen: z.enum(["proyecto", "corte", "manual"]),
  referenceId: z.string().nullable(),
  fecha: z.string(),
});

export const jobBoardSchema = z.object({
  clientId: z.string().min(1),
  nombreProyecto: z.string().min(2),
  monto: z.number().min(0),
  sena: z.number().min(0),
  fechaPrometida: z.string(),
  avance: z.number().min(0).max(100),
  estado: z.enum([
    "por_cotizar",
    "presupuestado",
    "aprobado",
    "en_produccion",
    "instalado",
    "entregado",
    "cobrado",
  ]),
});


