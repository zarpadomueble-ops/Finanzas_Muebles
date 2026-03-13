import { Badge } from "@/components/ui/badge";
import { formatPercentValue } from "@/lib/format";
import { cn } from "@/lib/utils";

interface PercentageBadgeProps {
  value: number;
  decimals?: number;
  invertColor?: boolean;
  className?: string;
}

export function PercentageBadge({ value, decimals = 1, invertColor = false, className }: PercentageBadgeProps) {
  const positive = value >= 0;
  const variant = invertColor
    ? positive
      ? "danger"
      : "success"
    : positive
      ? "success"
      : "danger";

  return (
    <Badge variant={variant} className={cn("font-semibold", className)}>
      {value > 0 ? "+" : ""}
      {formatPercentValue(value, { digits: decimals })}
    </Badge>
  );
}
