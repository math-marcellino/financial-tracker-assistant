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
import {
  useAddTransaction,
  useEditTransaction,
} from "@/hooks/use-transaction-mutations";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  TRANSACTION_TYPES,
  type AddTransactionArgs,
} from "@/lib/agent/tools";
import type { DashboardTransaction } from "@/lib/db/transactions";
import { humanizeCategory } from "@/lib/format";

type TransactionType = AddTransactionArgs["type"];
type Category = AddTransactionArgs["category"];

type FormState = {
  type: TransactionType;
  amount: string;
  category: Category;
  date: string;
  note: string;
  currency: string;
};

const categoriesFor = (type: TransactionType): readonly Category[] =>
  type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

/** Local calendar day, not UTC — at 1am in Jakarta, "today" is not yesterday. */
const today = (): string => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;

  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

const initialState = (row: DashboardTransaction | null): FormState =>
  row
    ? {
        type: row.type,
        amount: row.amount,
        category:
          row.categoryExpense ??
          row.categoryIncome ??
          categoriesFor(row.type)[0],
        date: row.date,
        note: row.note ?? "",
        currency: row.currency,
      }
    : {
        type: "expense",
        amount: "",
        category: EXPENSE_CATEGORIES[0],
        date: today(),
        note: "",
        // Blank means "my default currency", resolved server-side like the agent does.
        currency: "",
      };

const fieldClass =
  "w-full rounded-[var(--radius-xs)] border border-[var(--co-hairline)] bg-[var(--co-canvas)] px-2.5 py-2 text-[0.875rem] text-[var(--co-ink)] transition-colors focus-visible:border-[var(--co-form-focus)] focus-visible:outline-none";

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
 * Form body, keyed by the row being edited so each open starts from fresh state
 * rather than resetting it in an effect.
 */
const TransactionForm = ({
  userId,
  transaction,
  onDone,
}: {
  userId: number;
  transaction: DashboardTransaction | null;
  onDone: () => void;
}) => {
  const [form, setForm] = useState<FormState>(() =>
    initialState(transaction),
  );

  const add = useAddTransaction(userId);
  const edit = useEditTransaction(userId);
  const mutation = transaction ? edit : add;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  // Switching type invalidates the category, so pick the first valid one rather than
  // leaving a value the server is guaranteed to reject.
  const setType = (type: TransactionType) =>
    setForm((current) => ({
      ...current,
      type,
      category: categoriesFor(type).includes(current.category)
        ? current.category
        : categoriesFor(type)[0],
    }));

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const note = form.note.trim();
    const currency = form.currency.trim().toUpperCase();
    // Validation proper happens server-side against the tool schemas; Number() just
    // hands it a number to judge, and NaN is rejected there as non-finite.
    const fields = {
      amount: Number(form.amount),
      type: form.type,
      category: form.category,
      date: form.date,
    };

    if (transaction) {
      edit.mutate(
        { id: transaction.id, ...fields, note, ...(currency && { currency }) },
        { onSuccess: onDone },
      );
      return;
    }

    add.mutate(
      {
        ...fields,
        ...(note && { note }),
        ...(currency && { currency }),
      },
      { onSuccess: onDone },
    );
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div
        role="radiogroup"
        aria-label="Type"
        className="grid grid-cols-2 gap-1 rounded-[var(--radius-xl)] border border-[var(--co-hairline)] p-1"
      >
        {TRANSACTION_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={form.type === type}
            onClick={() => setType(type)}
            className={`rounded-[var(--radius-xl)] py-1.5 text-[0.8125rem] capitalize transition-colors ${
              form.type === type
                ? "bg-[var(--co-primary)] text-[var(--co-on-dark)]"
                : "text-[var(--co-body-muted)] hover:text-[var(--co-ink)]"
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_6rem] gap-3">
        <Field id="tx-amount" label="Amount">
          <input
            id="tx-amount"
            type="number"
            inputMode="decimal"
            min={0.01}
            step={0.01}
            required
            autoFocus
            value={form.amount}
            onChange={(event) => set("amount", event.target.value)}
            className={`${fieldClass} tabular-nums`}
          />
        </Field>

        <Field id="tx-currency" label="Currency">
          <input
            id="tx-currency"
            maxLength={3}
            placeholder="Default"
            value={form.currency}
            onChange={(event) => set("currency", event.target.value)}
            className={`${fieldClass} uppercase placeholder:normal-case`}
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field id="tx-category" label="Category">
          <select
            id="tx-category"
            value={form.category}
            onChange={(event) => {
              const next = categoriesFor(form.type).find(
                (category) => category === event.target.value,
              );

              if (next) set("category", next);
            }}
            className={`${fieldClass} capitalize`}
          >
            {categoriesFor(form.type).map((category) => (
              <option key={category} value={category}>
                {humanizeCategory(category)}
              </option>
            ))}
          </select>
        </Field>

        <Field id="tx-date" label="Date">
          <input
            id="tx-date"
            type="date"
            required
            value={form.date}
            onChange={(event) => set("date", event.target.value)}
            className={fieldClass}
          />
        </Field>
      </div>

      <Field id="tx-note" label="Note">
        <input
          id="tx-note"
          maxLength={500}
          placeholder="Optional"
          value={form.note}
          onChange={(event) => set("note", event.target.value)}
          className={fieldClass}
        />
      </Field>

      {mutation.error ? (
        <p role="alert" className="text-[0.8125rem] text-[var(--co-error)]">
          {mutation.error.message}
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
          disabled={mutation.isPending}
          className="co-pill px-4 py-2 text-[0.8125rem]"
        >
          {mutation.isPending
            ? "Saving…"
            : transaction
              ? "Save changes"
              : "Add transaction"}
        </button>
      </DialogFooter>
    </form>
  );
};

/** `transaction` null = adding a new one; a row = editing that row. */
export const TransactionFormDialog = ({
  userId,
  open,
  transaction,
  onOpenChange,
}: {
  userId: number;
  open: boolean;
  transaction: DashboardTransaction | null;
  onOpenChange: (open: boolean) => void;
}) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="rounded-[var(--radius-sm)] bg-[var(--co-canvas)] p-5 text-[var(--co-ink)] sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="text-[1.25rem] font-normal tracking-[-0.2px]">
          {transaction ? "Edit transaction" : "Add transaction"}
        </DialogTitle>
        <DialogDescription className="text-[var(--co-body-muted)]">
          {transaction
            ? "Change any field and save."
            : "Log it by hand instead of through the assistant."}
        </DialogDescription>
      </DialogHeader>

      {open ? (
        <TransactionForm
          key={transaction?.id ?? "new"}
          userId={userId}
          transaction={transaction}
          onDone={() => onOpenChange(false)}
        />
      ) : null}
    </DialogContent>
  </Dialog>
);
