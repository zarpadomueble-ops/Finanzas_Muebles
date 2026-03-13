import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrencyValue, formatNumberValue } from "@/lib/format";
import { cn } from "@/lib/utils";

interface KPIStatCardProps {
  label: string;
  value: number;
  format?: "currency" | "number";
  suffix?: string;
  deltaPct?: number;
  className?: string;
}

export function KPIStatCard({
  label,
  value,
  format = "currency",
  suffix,
  deltaPct,
  className,
}: KPIStatCardProps) {
  const formattedValue = format === "currency" ? formatCurrencyValue(value) : `${formatNumberValue(value)}${suffix ? ` ${suffix}` : ""}`;

  return (
    <Card className={cn("border-slate-200 bg-white", className)}>
      <CardContent className="space-y-2 p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-2xl font-semibold text-slate-900">{formattedValue}</p>
        {typeof deltaPct === "number" ? (
          <p
            className={cn(
              "inline-flex items-center gap-1 text-xs font-medium",
              deltaPct >= 0 ? "text-emerald-700" : "text-rose-700",
            )}
          >
            {deltaPct >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
            {formatNumberValue(Math.abs(deltaPct), { digits: 1 })}% vs. periodo anterior
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
