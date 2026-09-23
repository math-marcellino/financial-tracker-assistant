"use client";

import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { DashboardTransaction } from "@/lib/db/transactions";
import { humanizeCategory } from "@/lib/format";

/**
 * Refinements applied to the rows already on screen. The month selector above scopes
 * what gets fetched; these narrow what's shown within it.
 */
export type TableFilters = {
  category: string | null;
  from: string | null;
  to: string | null;
  min: string | null;
  max: string | null;
};

export const EMPTY_FILTERS: TableFilters = {
  category: null,
  from: null,
  to: null,
  min: null,
  max: null,
};

export const activeFilterCount = (filters: TableFilters): number =>
  Object.values(filters).filter((value) => value !== null && value !== "")
    .length;

export const categoryOf = (row: DashboardTransaction): string =>
  row.categoryExpense ?? row.categoryIncome ?? "";

/** Only categories present in the data — an option that matches nothing reads as a bug. */
export const categoriesIn = (rows: DashboardTransaction[]): string[] =>
  [...new Set(rows.map(categoryOf).filter(Boolean))].sort();

export const applyFilters = (
  rows: DashboardTransaction[],
  filters: TableFilters,
): DashboardTransaction[] =>
  rows.filter((row) => {
    if (filters.category && categoryOf(row) !== filters.category) return false;
    if (filters.from && row.date < filters.from) return false;
    if (filters.to && row.date > filters.to) return false;

    // Compared on magnitude: the sign is carried by `type`, so "min 50000" means
    // "at least 50,000" for an expense and an income alike.
    const amount = Number(row.amount);

    if (filters.min && amount < Number(filters.min)) return false;
    if (filters.max && amount > Number(filters.max)) return false;

    return true;
  });

const fieldClass =
  "w-full rounded-[var(--radius-xs)] border border-[var(--co-hairline)] bg-[var(--co-canvas)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--co-ink)] transition-colors focus-visible:border-[var(--co-form-focus)] focus-visible:outline-none";

const labelClass =
  "font-mono text-[0.6875rem] tracking-[0.28px] text-[var(--co-muted)] uppercase";

const Field = ({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1">
    <label htmlFor={id} className={labelClass}>
      {label}
    </label>
    {children}
  </div>
);

/**
 * One button rather than a row of controls: the filters are occasional, and a permanent
 * five-field bar costs more attention than it earns. The badge keeps active filters
 * visible while the panel is shut, so a filtered table never looks like the whole table.
 */
export const TransactionFilters = ({
  rows,
  filters,
  onChange,
}: {
  rows: DashboardTransaction[];
  filters: TableFilters;
  onChange: (filters: TableFilters) => void;
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const categories = categoriesIn(rows);
  const activeCount = activeFilterCount(filters);

  const set = <K extends keyof TableFilters>(key: K, value: string) =>
    onChange({ ...filters, [key]: value === "" ? null : value });

  // Escape and click-outside: a panel you can only close by finding the button again
  // is worse than no panel.
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onPointerDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="transaction-filters"
        className="co-pill-outline flex items-center gap-2 px-3.5 py-1.5 text-[0.8125rem]"
      >
        <SlidersHorizontal size={14} />
        Filters
        {activeCount > 0 ? (
          <span className="rounded-full bg-[var(--co-primary)] px-1.5 py-0.5 font-mono text-[0.6875rem] leading-none text-[var(--co-on-dark)]">
            {activeCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id="transaction-filters"
          className="absolute top-full left-0 z-20 mt-2 flex w-[min(20rem,calc(100vw-3rem))] flex-col gap-3 rounded-[var(--radius-sm)] border border-[var(--co-hairline)] bg-[var(--co-canvas)] p-4 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.2)]"
        >
          <Field id="filter-category" label="Category">
            <select
              id="filter-category"
              value={filters.category ?? ""}
              onChange={(event) => set("category", event.target.value)}
              className={`${fieldClass} capitalize`}
            >
              <option value="">All</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {humanizeCategory(category)}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field id="filter-from" label="From">
              <input
                id="filter-from"
                type="date"
                value={filters.from ?? ""}
                onChange={(event) => set("from", event.target.value)}
                className={fieldClass}
              />
            </Field>

            <Field id="filter-to" label="To">
              <input
                id="filter-to"
                type="date"
                value={filters.to ?? ""}
                onChange={(event) => set("to", event.target.value)}
                className={fieldClass}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field id="filter-min" label="Min amount">
              <input
                id="filter-min"
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="0"
                value={filters.min ?? ""}
                onChange={(event) => set("min", event.target.value)}
                className={`${fieldClass} tabular-nums`}
              />
            </Field>

            <Field id="filter-max" label="Max amount">
              <input
                id="filter-max"
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="No limit"
                value={filters.max ?? ""}
                onChange={(event) => set("max", event.target.value)}
                className={`${fieldClass} tabular-nums`}
              />
            </Field>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[var(--co-card-border)] pt-3">
            <button
              type="button"
              onClick={() => onChange(EMPTY_FILTERS)}
              disabled={activeCount === 0}
              className="flex items-center gap-1.5 text-[0.8125rem] text-[var(--co-body-muted)] transition-colors hover:text-[var(--co-ink)] disabled:opacity-40"
            >
              <X size={13} />
              Clear all
            </button>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="co-pill px-3.5 py-1.5 text-[0.8125rem]"
            >
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};
