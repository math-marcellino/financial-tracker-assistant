"use client";

import { X } from "lucide-react";

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

export const hasActiveFilters = (filters: TableFilters): boolean =>
  Object.values(filters).some((value) => value !== null && value !== "");

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
  "rounded-[var(--radius-xs)] border border-[var(--co-hairline)] bg-[var(--co-canvas)] px-2.5 py-1.5 text-[0.8125rem] text-[var(--co-ink)] transition-colors focus-visible:border-[var(--co-form-focus)] focus-visible:outline-none";

const labelClass =
  "font-mono text-[0.6875rem] tracking-[0.28px] text-[var(--co-muted)] uppercase";

export const TransactionFilters = ({
  rows,
  filters,
  onChange,
}: {
  rows: DashboardTransaction[];
  filters: TableFilters;
  onChange: (filters: TableFilters) => void;
}) => {
  const categories = categoriesIn(rows);
  const set = <K extends keyof TableFilters>(key: K, value: string) =>
    onChange({ ...filters, [key]: value === "" ? null : value });

  return (
    <div className="flex flex-col gap-3 border-b border-[var(--co-card-border)] pb-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="filter-category" className={labelClass}>
            Category
          </label>
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
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filter-from" className={labelClass}>
            From
          </label>
          <input
            id="filter-from"
            type="date"
            value={filters.from ?? ""}
            onChange={(event) => set("from", event.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filter-to" className={labelClass}>
            To
          </label>
          <input
            id="filter-to"
            type="date"
            value={filters.to ?? ""}
            onChange={(event) => set("to", event.target.value)}
            className={fieldClass}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filter-min" className={labelClass}>
            Min amount
          </label>
          <input
            id="filter-min"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="0"
            value={filters.min ?? ""}
            onChange={(event) => set("min", event.target.value)}
            className={`${fieldClass} w-28 tabular-nums`}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="filter-max" className={labelClass}>
            Max amount
          </label>
          <input
            id="filter-max"
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="∞"
            value={filters.max ?? ""}
            onChange={(event) => set("max", event.target.value)}
            className={`${fieldClass} w-28 tabular-nums`}
          />
        </div>

        {hasActiveFilters(filters) ? (
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="co-pill-outline flex items-center gap-1.5 px-3 py-1.5 text-[0.8125rem]"
          >
            <X size={13} />
            Clear
          </button>
        ) : null}
      </div>
    </div>
  );
};
