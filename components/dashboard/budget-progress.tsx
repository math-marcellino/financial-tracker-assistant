"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { BudgetFormDialog } from "@/components/dashboard/budget-form-dialog";
import { DeleteBudgetDialog } from "@/components/dashboard/delete-budget-dialog";
import type {
  BudgetPace,
  BudgetProgress as BudgetRow,
} from "@/lib/db/transactions";
import { formatAmount, formatCompact, humanizeCategory } from "@/lib/format";

const formatDay = (isoDate: string): string =>
  new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });

/**
 * One line, read-only. Every number is from SQL; this only picks the words. Absent
 * entirely when there's no pace — "not enough data" on every new budget would be noise.
 */
const PaceLine = ({
  pace,
  limit,
  currency,
}: {
  pace: BudgetPace;
  limit: number;
  currency: string;
}) => {
  const rate = `~${formatAmount(String(Math.round(Number(pace.dailyPace))), currency)}/day`;
  const projected = formatCompact(Number(pace.projectedTotal), currency);

  const outlook = pace.limitDate
    ? `on pace to hit the limit ${formatDay(pace.limitDate)}`
    : Number(pace.projectedTotal) > limit
      ? `≈ ${projected} by month end at this rate`
      : `on track · ≈ ${projected} by month end`;

  return (
    <p
      className={`text-[0.8125rem] ${
        pace.limitDate ? "text-[var(--co-error)]" : "text-[var(--co-muted)]"
      }`}
    >
      <span className="font-mono tabular-nums">{rate}</span>
      {" · "}
      {outlook}
    </p>
  );
};

/** Closed, adding a new budget, or editing an existing one. */
type FormTarget = { open: false } | { open: true; budget: BudgetRow | null };

/**
 * Progress against whatever `set_budget` or the budget form has written. Both numbers
 * come from SQL — the spend is summed by Postgres over the budget's own month, so
 * nothing here re-derives a total the database already knows.
 */
export const BudgetProgressList = ({
  userId,
  budgets,
  month,
}: {
  userId: number;
  budgets: BudgetRow[];
  /** The dashboard's selected month, used as the new budget's default. */
  month: string | null;
}) => {
  const [formTarget, setFormTarget] = useState<FormTarget>({ open: false });
  const [deleting, setDeleting] = useState<BudgetRow | null>(null);

  const addButton = (
    <button
      type="button"
      onClick={() => setFormTarget({ open: true, budget: null })}
      className="co-pill flex items-center gap-1.5 self-start px-3.5 py-1.5 text-[0.8125rem]"
    >
      <Plus size={14} />
      Add budget
    </button>
  );

  const dialogs = (
    <>
      <BudgetFormDialog
        userId={userId}
        open={formTarget.open}
        budget={formTarget.open ? formTarget.budget : null}
        budgets={budgets}
        defaultMonth={month}
        onOpenChange={(open) => {
          if (!open) setFormTarget({ open: false });
        }}
      />
      <DeleteBudgetDialog
        userId={userId}
        budget={deleting}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      />
    </>
  );

  if (budgets.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 py-6">
        <p className="text-base text-[var(--co-body-muted)]">
          No budgets set. Add one here, or try{" "}
          <span className="text-[var(--co-ink)]">
            set my groceries budget to 1.5 million
          </span>{" "}
          in the chat.
        </p>
        {addButton}
        {dialogs}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {addButton}
      <ul className="flex flex-col">
        {budgets.map((budget) => {
          const limit = Number(budget.limitAmount);
          const spent = Number(budget.spent);
          const ratio = limit > 0 ? spent / limit : 0;
          const over = spent > limit;
          // The bar caps at 100% so an overspend doesn't render off the end; the number
          // and the flag carry the overage instead.
          const width = Math.min(ratio, 1) * 100;

          return (
            <li
              key={budget.id}
              className="flex flex-col gap-2 border-b border-[var(--co-card-border)] py-4 last:border-b-0"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="flex items-center gap-1">
                  <span className="text-base capitalize">
                    {humanizeCategory(budget.category)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Edit ${humanizeCategory(budget.category)} budget for ${budget.month.slice(0, 7)}`}
                    onClick={() => setFormTarget({ open: true, budget })}
                    className="rounded-full p-1.5 text-[var(--co-muted)] transition-colors hover:text-[var(--co-ink)]"
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${humanizeCategory(budget.category)} budget for ${budget.month.slice(0, 7)}`}
                    onClick={() => setDeleting(budget)}
                    className="rounded-full p-1.5 text-[var(--co-muted)] transition-colors hover:text-[var(--co-error)]"
                  >
                    <Trash2 size={13} />
                  </button>
                </span>
                <span className="font-mono text-[0.875rem] tabular-nums text-[var(--co-body-muted)]">
                  {formatAmount(budget.spent, budget.currency)}
                  <span className="text-[var(--co-muted)]">
                    {" / "}
                    {formatAmount(budget.limitAmount, budget.currency)}
                  </span>
                </span>
              </div>

              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--co-card-border)]"
                role="progressbar"
                aria-valuenow={Math.round(ratio * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`${humanizeCategory(budget.category)} budget`}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${width}%`,
                    background: over
                      ? "var(--co-error)"
                      : "linear-gradient(90deg, var(--co-deep-green) 0%, var(--co-action-blue) 100%)",
                  }}
                />
              </div>

              {budget.pace ? (
                <PaceLine
                  pace={budget.pace}
                  limit={limit}
                  currency={budget.currency}
                />
              ) : null}

              <div className="flex items-center justify-between gap-4 text-[0.8125rem]">
                <span className="font-mono tracking-[0.28px] text-[var(--co-slate)] uppercase">
                  {budget.month.slice(0, 7)}
                </span>
                {over ? (
                  <span className="font-medium text-[var(--co-error)]">
                    Over by {formatAmount(String(spent - limit), budget.currency)}
                  </span>
                ) : (
                  <span className="text-[var(--co-muted)]">
                    {formatAmount(String(limit - spent), budget.currency)} left
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {dialogs}
    </div>
  );
};
