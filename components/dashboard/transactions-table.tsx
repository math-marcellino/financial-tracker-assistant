"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { useMemo, useState } from "react";

import {
  EMPTY_FILTERS,
  TransactionFilters,
  applyFilters,
  categoryOf,
  type TableFilters,
} from "@/components/dashboard/transaction-filters";
import type { DashboardTransaction } from "@/lib/db/transactions";
import { formatAmount, humanizeCategory } from "@/lib/format";

/**
 * DESIGN.md § research-table: rule-separated rows, title left, chips centre, date right.
 * No card boxing, no shadows — the rules carry the structure.
 */

type SortKey = "date" | "amount" | "category";
type SortDirection = "asc" | "desc";

const compare = (
  a: DashboardTransaction,
  b: DashboardTransaction,
  key: SortKey,
): number => {
  if (key === "amount") {
    // Signed, so a large expense sorts opposite a large income rather than beside it.
    const signed = (row: DashboardTransaction) =>
      Number(row.amount) * (row.type === "expense" ? -1 : 1);

    return signed(a) - signed(b);
  }

  if (key === "category") {
    return categoryOf(a).localeCompare(categoryOf(b));
  }

  return a.date.localeCompare(b.date);
};

export const TransactionsTable = ({
  transactions,
}: {
  transactions: DashboardTransaction[];
}) => {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [filters, setFilters] = useState<TableFilters>(EMPTY_FILTERS);

  const filtered = useMemo(
    () => applyFilters(transactions, filters),
    [transactions, filters],
  );

  const sorted = useMemo(() => {
    const rows = [...filtered].sort((a, b) => compare(a, b, sortKey));

    return direction === "asc" ? rows : rows.reverse();
  }, [filtered, sortKey, direction]);

  const toggle = (key: SortKey) => {
    if (key === sortKey) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(key);
    setDirection(key === "category" ? "asc" : "desc");
  };

  const header = (key: SortKey, label: string, align = "text-left") => (
    // aria-sort belongs on the header cell, not the button inside it.
    <th
      scope="col"
      className={`py-2 font-normal ${align}`}
      aria-sort={
        sortKey === key
          ? direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button
        type="button"
        onClick={() => toggle(key)}
        className="inline-flex items-center gap-1 text-[0.75rem] tracking-[0.28px] text-[var(--co-slate)] uppercase transition-colors hover:text-[var(--co-ink)]"
      >
        {label}
        {sortKey === key ? (
          direction === "asc" ? (
            <ArrowUp size={12} />
          ) : (
            <ArrowDown size={12} />
          )
        ) : null}
      </button>
    </th>
  );

  if (transactions.length === 0) {
    return (
      <p className="py-6 text-base text-[var(--co-body-muted)]">
        Nothing logged yet. Tell the assistant what you spent and it will show
        up here.
      </p>
    );
  }

  return (
    // Container query, not a viewport one: this table lives in a column whose width
    // is set by the layout, so the breakpoint has to track the column, not the window.
    <div className="@container flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TransactionFilters
          rows={transactions}
          filters={filters}
          onChange={setFilters}
        />
        <p className="text-[0.8125rem] text-[var(--co-muted)]">
          {sorted.length === transactions.length
            ? `${transactions.length} transactions`
            : `${sorted.length} of ${transactions.length} transactions`}
        </p>
        {/* The fetch is capped, so a full page of results may be hiding older
            matches. Say so rather than letting an incomplete list look complete. */}
        {transactions.length >= 200 ? (
          <p className="text-[0.75rem] text-[var(--co-muted)]">
            Showing the most recent 200 — narrow by month for older records.
          </p>
        ) : null}
      </div>

      {sorted.length === 0 ? (
        <p className="py-6 text-base text-[var(--co-body-muted)]">
          No transactions match these filters.
        </p>
      ) : (
        <div className="w-full">
          <table className="w-full table-fixed border-collapse font-mono text-[0.9375rem]">
            <thead>
              <tr className="border-b border-[var(--co-hairline)]">
                {header("date", "Date")}
                {header("category", "Category")}
                <th
                  scope="col"
                  className="hidden py-2 text-left font-normal @md:table-cell"
                >
                  <span className="text-[0.75rem] tracking-[0.28px] text-[var(--co-slate)] uppercase">
                    Note
                  </span>
                </th>
                {header("amount", "Amount", "text-right")}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-[var(--co-card-border)] last:border-b-0"
                >
                  <td className="py-3 whitespace-nowrap tabular-nums text-[var(--co-body-muted)]">
                    {row.date}
                  </td>
                  <td className="py-3 pr-4">
                    <span className="co-chip-taxonomy inline-block px-2.5 py-0.5 font-sans text-[0.8125rem] capitalize">
                      {humanizeCategory(categoryOf(row))}
                    </span>
                  </td>
                  <td className="hidden truncate py-3 pr-4 font-sans text-[0.9375rem] text-[var(--co-body-muted)] @md:table-cell">
                    {row.note ?? "—"}
                  </td>
                  <td className="py-3 text-right whitespace-nowrap tabular-nums">
                    {row.type === "expense" ? "−" : "+"}
                    {formatAmount(row.amount, row.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
