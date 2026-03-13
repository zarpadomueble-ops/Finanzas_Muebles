"use client";

import { useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  buildMonthOptions,
  buildYearOptions,
  getCurrentPeriodFilter,
  getPeriodLabel,
  parsePeriodMonth,
  parsePeriodYear,
  withDerivedPeriodKey,
} from "@/domain/periods";
import type { PeriodFilter, PeriodMonthValue, PeriodYearValue } from "@/types";

const STORAGE_KEY = "carpi-erp-global-period";

interface PersistedPeriod {
  month?: PeriodMonthValue;
  year?: PeriodYearValue;
}

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readPersistedPeriod(): PersistedPeriod | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedPeriod) : null;
  } catch {
    return null;
  }
}

function persistPeriod(filter: PeriodFilter) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      month: filter.month,
      year: filter.year,
    } satisfies PersistedPeriod),
  );
}

function buildNextSearchParams(
  searchParams: URLSearchParams,
  patch: {
    month?: PeriodMonthValue;
    year?: PeriodYearValue;
  },
) {
  const next = new URLSearchParams(searchParams.toString());

  if (patch.month !== undefined) {
    next.set("month", String(patch.month));
  }

  if (patch.year !== undefined) {
    next.set("year", String(patch.year));
  }

  return next;
}

export function usePeriodFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const fallback = useMemo(() => {
    const current = getCurrentPeriodFilter();
    const persisted = readPersistedPeriod();

    return withDerivedPeriodKey({
      month: persisted?.month ?? current.month,
      year: persisted?.year ?? current.year,
    });
  }, []);

  const filter = useMemo(() => {
    const month = parsePeriodMonth(searchParams.get("month"), fallback.month);
    const year = parsePeriodYear(searchParams.get("year"), fallback.year);

    return withDerivedPeriodKey({ month, year });
  }, [fallback.month, fallback.year, searchParams]);

  useEffect(() => {
    persistPeriod(filter);
  }, [filter]);

  useEffect(() => {
    if (searchParams.get("month") && searchParams.get("year")) {
      return;
    }

    const nextParams = buildNextSearchParams(new URLSearchParams(searchParams.toString()), {
      month: filter.month,
      year: filter.year,
    });

    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  }, [filter.month, filter.year, pathname, router, searchParams]);

  const updatePeriod = (patch: Partial<Pick<PeriodFilter, "month" | "year">>) => {
    const nextParams = buildNextSearchParams(new URLSearchParams(searchParams.toString()), {
      month: patch.month ?? filter.month,
      year: patch.year ?? filter.year,
    });

    router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
  };

  const currentYear = typeof fallback.year === "number" ? fallback.year : new Date().getFullYear();

  return {
    filter,
    periodLabel: getPeriodLabel(filter),
    monthOptions: buildMonthOptions(),
    yearOptions: buildYearOptions(currentYear, 8),
    setMonth: (month: PeriodMonthValue) => updatePeriod({ month }),
    setYear: (year: PeriodYearValue) => updatePeriod({ year }),
    resetToCurrent: () => {
      const current = getCurrentPeriodFilter();
      updatePeriod({
        month: current.month,
        year: current.year,
      });
    },
  };
}
