"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { useMessages } from "@/hooks/use-messages";
import { useSendMessage } from "@/hooks/use-send-message";
import { messagesQueryKey } from "@/lib/api/messages";
import type { Message, TransactionSnapshot } from "@/lib/db/schema";

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
    ...(Number.isInteger(value) && {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }),
  }).format(value);
};

/** Renders the snapshot stored with the turn, not the live row it came from. */
const TransactionCard = ({ snapshot }: { snapshot: TransactionSnapshot }) => {
  const sign = snapshot.type === "expense" ? "−" : "+";

  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg border border-border bg-background p-3 text-sm">
      <dt className="text-muted-foreground">Amount</dt>
      <dd className="font-medium tabular-nums">
        {sign}
        {formatAmount(snapshot.amount, snapshot.currency)}
      </dd>

      <dt className="text-muted-foreground">Category</dt>
      <dd>{snapshot.category?.replace(/_/g, " ")}</dd>

      <dt className="text-muted-foreground">Date</dt>
      <dd className="tabular-nums">{snapshot.date}</dd>

      {snapshot.note ? (
        <>
          <dt className="text-muted-foreground">Note</dt>
          <dd>{snapshot.note}</dd>
        </>
      ) : null}
    </dl>
  );
};

const Bubble = ({
  role,
  children,
}: {
  role: "user" | "assistant" | "error";
  children: React.ReactNode;
}) => (
  <div
    className={
      role === "user"
        ? "self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
        : role === "error"
          ? "self-start rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          : "w-full max-w-md self-start rounded-lg bg-muted px-3 py-2 text-sm"
    }
  >
    {children}
  </div>
);

export const ChatBox = ({ userId }: { userId: number }) => {
  const [draft, setDraft] = useState("");
  // Errors are per-attempt and not worth storing; they live only in this view.
  const [errors, setErrors] = useState<string[]>([]);
  const queryClient = useQueryClient();
  const { data: messages = [], isPending: isLoadingHistory } =
    useMessages(userId);
  const { mutate, isPending } = useSendMessage();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const message = draft.trim();

    if (!message || isPending) {
      return;
    }

    setDraft("");
    setErrors([]);

    mutate(message, {
      onSuccess: (result) => {
        if (!result.ok) {
          setErrors((current) => [...current, result.error]);
        }

        // The turn is persisted server-side, so refetch rather than guessing at it.
        void queryClient.invalidateQueries({
          queryKey: messagesQueryKey(userId),
        });
      },
      // A failed request is shown, not swallowed into a cheerful placeholder reply.
      onError: (error) => {
        setErrors((current) => [...current, error.message]);
      },
    });
  };

  return (
    <section className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-3">
        {isLoadingHistory ? (
          <p className="text-sm text-muted-foreground">Loading history…</p>
        ) : null}

        {!isLoadingHistory && messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Try{" "}
            <span className="font-medium text-foreground">
              spent 45k on lunch
            </span>
            , or ask{" "}
            <span className="font-medium text-foreground">
              how much did I spend on food this month?
            </span>
          </p>
        ) : null}

        {messages.map((message: Message) => (
          <Bubble key={message.id} role={message.role}>
            <p className="whitespace-pre-wrap">{message.content}</p>
            {message.role === "assistant" && message.transactionSnapshot ? (
              <TransactionCard snapshot={message.transactionSnapshot} />
            ) : null}
          </Bubble>
        ))}

        {errors.map((error, index) => (
          <Bubble key={`error-${index}`} role="error">
            <p className="whitespace-pre-wrap">{error}</p>
          </Bubble>
        ))}

        {isPending ? (
          <p className="text-sm text-muted-foreground">Thinking…</p>
        ) : null}
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
        <Button
          type="submit"
          size="lg"
          disabled={isPending || draft.trim().length === 0}
        >
          Send
        </Button>
      </form>
    </section>
  );
};
