import { JobStatus, MaterialCategory } from "@/lib/types";

export const moduleNav = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clientes", label: "Clientes" },
  { href: "/materiales", label: "Materiales" },
  { href: "/parametros", label: "Parámetros" },
  { href: "/proyectos", label: "Proyectos" },
  { href: "/ecommerce", label: "Ecommerce" },
  { href: "/corte", label: "Corte" },
  { href: "/compras", label: "Compras" },
  { href: "/presupuestos", label: "Presupuestos" },
  { href: "/obras", label: "Obras" },
  { href: "/rentabilidad", label: "Rentabilidad" },
  { href: "/configuracion", label: "Configuración" },
] as const;

export const materialCategories: MaterialCategory[] = [
  "placas",
  "herrajes",
  "perfiles",
  "insumos",
  "logistica",
  "servicios",
];

export const jobStatusList: JobStatus[] = [
  "por_cotizar",
  "presupuestado",
  "aprobado",
  "en_produccion",
  "instalado",
  "entregado",
  "cobrado",
];

export const jobStatusLabels: Record<JobStatus, string> = {
  por_cotizar: "Por cotizar",
  presupuestado: "Presupuestado",
  aprobado: "Aprobado",
  en_produccion: "En producción",
  instalado: "Instalado",
  entregado: "Entregado",
  cobrado: "Cobrado",
};

