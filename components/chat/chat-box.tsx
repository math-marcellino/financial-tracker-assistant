"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ChatContainerContent,
  ChatContainerRoot,
} from "@/components/ui/chat-container";
import { Loader } from "@/components/ui/loader";
import {
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/ui/prompt-input";
import { PromptSuggestion } from "@/components/ui/prompt-suggestion";
import { ScrollButton } from "@/components/ui/scroll-button";
import { useMessages } from "@/hooks/use-messages";
import { useSendMessage } from "@/hooks/use-send-message";
import { messagesQueryKey } from "@/lib/api/messages";
import type { Message, TransactionSnapshot } from "@/lib/db/schema";

/** Shown only on an empty thread: one per tool group, so the read tools are discoverable. */
const SUGGESTIONS = [
  "spent 45k on lunch",
  "how much did I spend on food this month?",
  "set my groceries budget to 1.5 million",
];

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

export const ChatBox = ({ userId }: { userId: number }) => {
  const [draft, setDraft] = useState("");
  // Errors are per-attempt and not worth storing; they live only in this view.
  const [errors, setErrors] = useState<string[]>([]);
  const queryClient = useQueryClient();
  const { data: messages = [], isPending: isLoadingHistory } =
    useMessages(userId);
  const { mutate, isPending } = useSendMessage();

  const send = (text: string) => {
    const message = text.trim();

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

  const isEmpty = !isLoadingHistory && messages.length === 0;

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col gap-4">
      <div className="relative min-h-0 flex-1">
        <ChatContainerRoot className="h-full">
          <ChatContainerContent className="flex flex-col gap-3 pb-4">
            {isLoadingHistory ? (
              <Loader variant="text-shimmer" text="Loading history…" size="sm" />
            ) : null}

            {messages.map((message: Message) => (
              <div
                key={message.id}
                className={
                  message.role === "user"
                    ? "max-w-md self-end rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground"
                    : "w-full max-w-md self-start rounded-lg bg-muted px-3 py-2 text-sm"
                }
              >
                <p className="whitespace-pre-wrap">{message.content}</p>
                {message.role === "assistant" && message.transactionSnapshot ? (
                  <TransactionCard snapshot={message.transactionSnapshot} />
                ) : null}
              </div>
            ))}

            {errors.map((error, index) => (
              <div
                key={`error-${index}`}
                className="self-start rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <p className="whitespace-pre-wrap">{error}</p>
              </div>
            ))}

            {isPending ? (
              <Loader variant="typing" size="md" className="self-start" />
            ) : null}
          </ChatContainerContent>

          <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
            <ScrollButton />
          </div>
        </ChatContainerRoot>
      </div>

      {isEmpty ? (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <PromptSuggestion
              key={suggestion}
              size="sm"
              onClick={() => send(suggestion)}
            >
              {suggestion}
            </PromptSuggestion>
          ))}
        </div>
      ) : null}

      <PromptInput
        value={draft}
        onValueChange={setDraft}
        onSubmit={() => send(draft)}
        isLoading={isPending}
      >
        <PromptInputTextarea
          placeholder="spent 45k on lunch"
          aria-label="Message"
        />
        {/* Not wrapped in PromptInputAction: its TooltipTrigger renders its own
            button, which would nest one button inside another. */}
        <PromptInputActions className="justify-end pt-2">
          <Button
            type="button"
            size="icon"
            aria-label="Send"
            onClick={() => send(draft)}
            disabled={isPending || draft.trim().length === 0}
          >
            <ArrowUp />
          </Button>
        </PromptInputActions>
      </PromptInput>
    </section>
  );
};
