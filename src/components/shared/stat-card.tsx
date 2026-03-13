import { KPIStatCard } from "@/components/shared/kpi-stat-card";

interface StatCardProps {
  title: string;
  value: number;
  unit?: "$" | "%" | "u";
  delta?: number;
}

export function StatCard({ title, value, unit = "$", delta }: StatCardProps) {
  if (unit === "%") {
    return <KPIStatCard label={title} value={value} format="number" suffix="%" deltaPct={delta} />;
  }

  if (unit === "u") {
    return <KPIStatCard label={title} value={value} format="number" suffix="u" deltaPct={delta} />;
  }

  return <KPIStatCard label={title} value={value} format="currency" deltaPct={delta} />;
}
