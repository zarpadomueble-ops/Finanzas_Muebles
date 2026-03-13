import { Badge } from "@/components/ui/badge";

type StatusBadgeTone = "default" | "secondary" | "success" | "warning" | "danger";

interface StatusBadgeProps {
  status: string;
  label?: string;
  className?: string;
}

const statusMap: Record<string, { label: string; tone: StatusBadgeTone }> = {
  active: { label: "Activo", tone: "success" },
  inactive: { label: "Inactivo", tone: "secondary" },
  draft: { label: "Borrador", tone: "secondary" },
  pending: { label: "Pendiente", tone: "warning" },
  approved: { label: "Aprobado", tone: "success" },
  rejected: { label: "Rechazado", tone: "danger" },
  cancelled: { label: "Cancelado", tone: "danger" },
  completed: { label: "Completado", tone: "success" },
  partial: { label: "Parcial", tone: "warning" },
  purchased: { label: "Comprado", tone: "success" },
  in_progress: { label: "En progreso", tone: "default" },
  optimized: { label: "Optimizado", tone: "success" },
  paused: { label: "Pausado", tone: "warning" },
  archived: { label: "Archivado", tone: "secondary" },
  sent: { label: "Enviado", tone: "default" },
  expired: { label: "Vencido", tone: "danger" },
  por_cotizar: { label: "Por cotizar", tone: "secondary" },
  presupuestado: { label: "Presupuestado", tone: "warning" },
  aprobado: { label: "Aprobado", tone: "success" },
  en_produccion: { label: "En produccion", tone: "default" },
  instalado: { label: "Instalado", tone: "default" },
  entregado: { label: "Entregado", tone: "success" },
  cobrado: { label: "Cobrado", tone: "success" },
};

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const normalized = status.trim().toLowerCase();
  const config = statusMap[normalized] ?? { label: status, tone: "secondary" as const };

  return (
    <Badge variant={config.tone} className={className}>
      {label ?? config.label}
    </Badge>
  );
}
