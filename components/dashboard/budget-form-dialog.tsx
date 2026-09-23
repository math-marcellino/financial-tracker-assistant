"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSetBudget } from "@/hooks/use-budget-mutations";
import { EXPENSE_CATEGORIES, type SetBudgetArgs } from "@/lib/agent/tools";
import type { BudgetProgress } from "@/lib/db/transactions";
import { humanizeCategory } from "@/lib/format";

type Category = SetBudgetArgs["category"];

type FormState = {
  category: Category;
  month: string;
  limit: string;
  currency: string;
};

const currentMonth = (): string => {
  const now = new Date();

  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

const formatMonth = (month: string): string =>
  new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
  });

const fieldClass =
  "w-full rounded-[var(--radius-xs)] border border-[var(--co-hairline)] bg-[var(--co-canvas)] px-2.5 py-2 text-[0.875rem] text-[var(--co-ink)] transition-colors focus-visible:border-[var(--co-form-focus)] focus-visible:outline-none disabled:bg-[var(--co-soft-stone)] disabled:text-[var(--co-body-muted)]";

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
 * Editing changes only the limit and currency. Category and month are what identify a
 * budget (a unique index enforces it), so moving one would collide with whatever
 * already sits there; that's a delete and a fresh add.
 */
const BudgetForm = ({
  userId,
  budget,
  budgets,
  defaultMonth,
  onDone,
}: {
  userId: number;
  budget: BudgetProgress | null;
  budgets: BudgetProgress[];
  defaultMonth: string | null;
  onDone: () => void;
}) => {
  const [form, setForm] = useState<FormState>(() =>
    budget
      ? {
          category:
            EXPENSE_CATEGORIES.find((c) => c === budget.category) ??
            EXPENSE_CATEGORIES[0],
          month: budget.month.slice(0, 7),
          limit: budget.limitAmount,
          currency: budget.currency,
        }
      : {
          category: EXPENSE_CATEGORIES[0],
          month: defaultMonth ?? currentMonth(),
          limit: "",
          // Blank means "my default currency", resolved server-side like set_budget.
          currency: "",
        },
  );

  const save = useSetBudget(userId);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  // Adding onto an existing (category, month) is an upsert, same as the agent's
  // set_budget. Said up front so it doesn't look like a silent overwrite.
  const replaces = budget
    ? null
    : budgets.find(
        (existing) =>
          existing.category === form.category &&
          existing.month.slice(0, 7) === form.month,
      );

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const currency = form.currency.trim().toUpperCase();

    // Number() hands the schema something to judge; NaN is rejected there.
    save.mutate(
      {
        category: form.category,
        month: form.month,
        limit: Number(form.limit),
        ...(currency && { currency }),
      },
      { onSuccess: onDone },
    );
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field id="budget-category" label="Category">
          <select
            id="budget-category"
            value={form.category}
            disabled={budget !== null}
            onChange={(event) => {
              const next = EXPENSE_CATEGORIES.find(
                (category) => category === event.target.value,
              );

              if (next) set("category", next);
            }}
            className={`${fieldClass} capitalize`}
          >
            {EXPENSE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {humanizeCategory(category)}
              </option>
            ))}
          </select>
        </Field>

        <Field id="budget-month" label="Month">
          <input
            id="budget-month"
            type="month"
            required
            disabled={budget !== null}
            value={form.month}
            onChange={(event) => set("month", event.target.value)}
            className={fieldClass}
          />
        </Field>
      </div>

      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Field id="budget-limit" label="Monthly limit">
          <input
            id="budget-limit"
            type="number"
            inputMode="decimal"
            min={0.01}
            step={0.01}
            required
            autoFocus
            value={form.limit}
            onChange={(event) => set("limit", event.target.value)}
            className={`${fieldClass} tabular-nums`}
          />
        </Field>

        <Field id="budget-currency" label="Currency">
          <input
            id="budget-currency"
            maxLength={3}
            placeholder="Default"
            value={form.currency}
            onChange={(event) => set("currency", event.target.value)}
            className={`${fieldClass} uppercase placeholder:normal-case`}
          />
        </Field>
      </div>

      {replaces ? (
        <p className="text-[0.8125rem] text-[var(--co-body-muted)]">
          This replaces the existing{" "}
          <span className="capitalize">
            {humanizeCategory(replaces.category)}
          </span>{" "}
          budget for {formatMonth(form.month)}.
        </p>
      ) : null}

      {save.error ? (
        <p role="alert" className="text-[0.8125rem] text-[var(--co-error)]">
          {save.error.message}
        </p>
      ) : null}

      <DialogFooter className="mx-0 mb-0 border-t-0 bg-transparent p-0">
        <button
          type="button"
          onClick={onDone}
          className="co-pill-outline px-4 py-2 text-[0.8125rem]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={save.isPending}
          className="co-pill px-4 py-2 text-[0.8125rem]"
        >
          {save.isPending
            ? "Saving…"
            : budget
              ? "Save changes"
              : replaces
                ? "Replace budget"
                : "Add budget"}
        </button>
      </DialogFooter>
    </form>
  );
};

/** `budget` null = adding a new one; a row = editing that budget's limit. */
export const BudgetFormDialog = ({
  userId,
  open,
  budget,
  budgets,
  defaultMonth,
  onOpenChange,
}: {
  userId: number;
  open: boolean;
  budget: BudgetProgress | null;
  budgets: BudgetProgress[];
  defaultMonth: string | null;
  onOpenChange: (open: boolean) => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="rounded-[var(--radius-sm)] bg-[var(--co-canvas)] p-5 text-[var(--co-ink)] sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="text-[1.25rem] font-normal tracking-[-0.2px]">
          {budget ? "Edit budget" : "Add budget"}
        </DialogTitle>
        <DialogDescription className="text-[var(--co-body-muted)]">
          {budget
            ? "Change the limit. To move it to another category or month, delete it and add a new one."
            : "A monthly spending limit for one expense category."}
        </DialogDescription>
      </DialogHeader>

      {open ? (
        <BudgetForm
          key={budget?.id ?? "new"}
          userId={userId}
          budget={budget}
          budgets={budgets}
          defaultMonth={defaultMonth}
          onDone={() => onOpenChange(false)}
        />
      ) : null}
    </DialogContent>
  </Dialog>
);
