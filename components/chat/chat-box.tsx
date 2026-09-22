"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { useSendMessage } from "@/hooks/use-send-message";
import type { Transaction } from "@/lib/db/schema";

type Entry =
  | { role: "user"; text: string }
  | { role: "agent"; text: string; transaction: Transaction | null }
  | { role: "error"; text: string };

/**
 * Display only. The stored value stays the exact string Postgres returned; this never
 * feeds back into a write.
 *
 * Whole amounts drop their minor units. Intl still renders IDR with two decimals, and
 * "Rp 250,000.00" is noise for a currency nobody quotes in cents.
 */
const formatAmount = (amount: string, currency: string): string => {
  const value = Number(amount);

  if (!Number.isFinite(value)) {
    return `${amount} ${currency}`;
  }

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    ...(Number.isInteger(value) && { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  }).format(value);
};

const TransactionCard = ({ transaction }: { transaction: Transaction }) => {
  const category = transaction.categoryExpense ?? transaction.categoryIncome;
  const sign = transaction.type === "expense" ? "−" : "+";

  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-border bg-background p-3 text-sm">
      <dt className="text-muted-foreground">Amount</dt>
      <dd className="font-medium tabular-nums">
        {sign}
        {formatAmount(transaction.amount, transaction.currency)}
      </dd>

      <dt className="text-muted-foreground">Category</dt>
      <dd>{category?.replace(/_/g, " ")}</dd>

      <dt className="text-muted-foreground">Date</dt>
      <dd className="tabular-nums">{transaction.date}</dd>

      {transaction.note ? (
        <>
          <dt className="text-muted-foreground">Note</dt>
          <dd>{transaction.note}</dd>
        </>
      ) : null}
    </dl>
  );
};

export const ChatBox = () => {
  const [draft, setDraft] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const { mutate, isPending } = useSendMessage();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const message = draft.trim();

    if (!message || isPending) {
      return;
    }

    setEntries((current) => [...current, { role: "user", text: message }]);
    setDraft("");

    mutate(message, {
      onSuccess: (result) => {
        setEntries((current) => [
          ...current,
          result.ok
            ? { role: "agent", text: result.reply, transaction: result.transaction }
            : { role: "error", text: result.error },
        ]);
      },
      // A failed request is shown, not swallowed into a cheerful placeholder reply.
      onError: (error) => {
        setEntries((current) => [...current, { role: "error", text: error.message }]);
      },
    });
  };

  return (
    <section className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-3">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Try <span className="font-medium text-foreground">spent 45k on lunch</span>.
          </p>
        ) : null}

        {entries.map((entry, index) => (
          <div
            key={index}
            className={
              entry.role === "user"
                ? "self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                : entry.role === "error"
                  ? "self-start rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  : "self-start w-full max-w-md rounded-lg bg-muted px-3 py-2 text-sm"
            }
          >
            <p className="whitespace-pre-wrap">{entry.text}</p>
            {entry.role === "agent" && entry.transaction ? (
              <TransactionCard transaction={entry.transaction} />
            ) : null}
          </div>
        ))}

        {isPending ? <p className="text-sm text-muted-foreground">Thinking…</p> : null}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <label htmlFor="chat-message" className="sr-only">
          Message
        </label>
        <input
          id="chat-message"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="spent 45k on lunch"
          autoComplete="off"
          className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button type="submit" size="lg" disabled={isPending || draft.trim().length === 0}>
          Send
        </Button>
      </form>
    </section>
  );
};
