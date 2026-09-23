"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import { DeleteTransactionDialog } from "@/components/dashboard/delete-transaction-dialog";
import { TransactionFormDialog } from "@/components/dashboard/transaction-form-dialog";
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

const PAGE_SIZE = 20;

/** Closed, adding a new row, or editing an existing one. */
type FormTarget =
  | { open: false }
  | { open: true; transaction: DashboardTransaction | null };

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

/** Arrives as a Date from the server prefetch and as an ISO string from a refetch. */
const createdAtMs = (row: DashboardTransaction): number =>
  new Date(row.createdAt).getTime();

/**
 * The direction applies to the chosen column only. Ties always fall back to newest
 * first — date, then time logged — so several entries on one day keep the order they
 * were added in. Reversing the whole list flipped the ties too, which is what put
 * today's entries out of order.
 */
const sortRows = (
  rows: DashboardTransaction[],
  key: SortKey,
  direction: SortDirection,
): DashboardTransaction[] => {
  const sign = direction === "asc" ? 1 : -1;

  return [...rows].sort(
    (a, b) =>
      sign * compare(a, b, key) ||
      b.date.localeCompare(a.date) ||
      createdAtMs(b) - createdAtMs(a),
  );
};

export const TransactionsTable = ({
  userId,
  transactions,
}: {
  userId: number;
  transactions: DashboardTransaction[];
}) => {
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [direction, setDirection] = useState<SortDirection>("desc");
  const [filters, setFilters] = useState<TableFilters>(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [formTarget, setFormTarget] = useState<FormTarget>({ open: false });
  const [deleting, setDeleting] = useState<DashboardTransaction | null>(null);

  // Any change to what's in the list starts over from its first page; a page number
  // carried across a new filter points at rows the user never asked for.
  const updateFilters = (next: TableFilters) => {
    setFilters(next);
    setPage(0);
  };

  const filtered = useMemo(
    () => applyFilters(transactions, filters),
    [transactions, filters],
  );

  const sorted = useMemo(
    () => sortRows(filtered, sortKey, direction),
    [filtered, sortKey, direction],
  );

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  // Clamped at read time, not stored: a delete, a poll or a month switch can shrink the
  // list under the current page, and an effect to fix it up would render a blank page first.
  const currentPage = Math.min(page, pageCount - 1);
  const firstIndex = currentPage * PAGE_SIZE;
  const visible = sorted.slice(firstIndex, firstIndex + PAGE_SIZE);

  const toggle = (key: SortKey) => {
    setPage(0);

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

  const addButton = (
    <button
      type="button"
      onClick={() => setFormTarget({ open: true, transaction: null })}
      className="co-pill flex items-center gap-1.5 px-3.5 py-1.5 text-[0.8125rem]"
    >
      <Plus size={14} />
      Add
    </button>
  );

  const dialogs = (
    <>
      <TransactionFormDialog
        userId={userId}
        open={formTarget.open}
        transaction={formTarget.open ? formTarget.transaction : null}
        onOpenChange={(open) => {
          if (!open) setFormTarget({ open: false });
        }}
      />
      <DeleteTransactionDialog
        userId={userId}
        transaction={deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      />
    </>
  );

  if (transactions.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 py-6">
        <p className="text-base text-[var(--co-body-muted)]">
          Nothing logged yet. Tell the assistant what you spent, or add it by
          hand.
        </p>
        {addButton}
        {dialogs}
      </div>
    );
  }

  return (
    // Container query, not a viewport one: this table lives in a column whose width
    // is set by the layout, so the breakpoint has to track the column, not the window.
    <div className="@container flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TransactionFilters
            rows={transactions}
            filters={filters}
            onChange={updateFilters}
          />
          {addButton}
        </div>
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
                <th scope="col" className="w-18 py-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
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
                    {row.note || "—"}
                  </td>
                  <td className="py-3 text-right whitespace-nowrap tabular-nums">
                    {row.type === "expense" ? "−" : "+"}
                    {formatAmount(row.amount, row.currency)}
                  </td>
                  <td className="py-3 pl-2">
                    <div className="flex justify-end gap-0.5">
                      <button
                        type="button"
                        aria-label={`Edit ${humanizeCategory(categoryOf(row))} on ${row.date}`}
                        onClick={() =>
                          setFormTarget({ open: true, transaction: row })
                        }
                        className="rounded-full p-1.5 text-[var(--co-muted)] transition-colors hover:text-[var(--co-ink)]"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${humanizeCategory(categoryOf(row))} on ${row.date}`}
                        onClick={() => setDeleting(row)}
                        className="rounded-full p-1.5 text-[var(--co-muted)] transition-colors hover:text-[var(--co-error)]"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {pageCount > 1 ? (
            <nav
              aria-label="Transactions pages"
              className="flex items-center justify-between gap-3 border-t border-[var(--co-hairline)] pt-3 text-[0.8125rem] text-[var(--co-muted)]"
            >
              <span className="font-mono tabular-nums">
                {firstIndex + 1}–{firstIndex + visible.length} of{" "}
                {sorted.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage(currentPage - 1)}
                  disabled={currentPage === 0}
                  aria-label="Previous page"
                  className="co-pill-outline flex items-center p-1.5 disabled:opacity-40"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="font-mono tabular-nums">
                  Page {currentPage + 1} of {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(currentPage + 1)}
                  disabled={currentPage === pageCount - 1}
                  aria-label="Next page"
                  className="co-pill-outline flex items-center p-1.5 disabled:opacity-40"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </nav>
          ) : null}
        </div>
      )}

      {dialogs}
    </div>
  );
};
