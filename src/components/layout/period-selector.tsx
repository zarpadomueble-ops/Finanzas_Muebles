"use client";

import { CalendarRange, RotateCcw } from "lucide-react";
import { usePeriodFilter } from "@/hooks";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

export function PeriodSelector() {
  const { filter, periodLabel, monthOptions, yearOptions, setMonth, setYear, resetToCurrent } =
    usePeriodFilter();

  return (
    <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5">
      <CalendarRange className="hidden h-4 w-4 text-slate-500 xl:block" />

      <div className="hidden min-w-0 xl:block">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Periodo
        </p>
        <p className="truncate text-sm font-medium text-slate-900">{periodLabel}</p>
      </div>

      <Select
        value={String(filter.month)}
        onChange={(event) =>
          setMonth(event.target.value === "all" ? "all" : Number(event.target.value))
        }
        className="h-8 min-w-32"
        aria-label="Seleccionar mes"
      >
        <option value="all">Todos los meses</option>
        {monthOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>

      <Select
        value={String(filter.year)}
        onChange={(event) =>
          setYear(event.target.value === "all" ? "all" : Number(event.target.value))
        }
        className="h-8 min-w-24"
        aria-label="Seleccionar año"
      >
        <option value="all">Todos</option>
        {yearOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label="Volver al periodo actual"
        onClick={resetToCurrent}
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
    </div>
  );
}
