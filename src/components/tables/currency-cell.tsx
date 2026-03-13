import { formatCurrencyValue } from "@/lib/format";
import { cn } from "@/lib/utils";

interface CurrencyCellProps {
  value: number;
  currency?: string;
  locale?: string;
  className?: string;
}

export function CurrencyCell({ value, currency = "ARS", locale = "es-AR", className }: CurrencyCellProps) {
  return <span className={cn("font-medium tabular-nums text-slate-900", className)}>{formatCurrencyValue(value, { currency, locale })}</span>;
}
