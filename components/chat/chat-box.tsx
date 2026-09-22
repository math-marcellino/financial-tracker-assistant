"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowUp, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  ChatContainerContent,
  ChatContainerRoot,
} from "@/components/ui/chat-container";
import { DotsLoader } from "@/components/ui/loader";
import {
  Message,
  MessageActions,
  MessageContent,
} from "@/components/ui/message";
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
import type { Message as ChatMessage, TransactionSnapshot } from "@/lib/db/schema";

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
    <dl className="mt-1 grid w-full max-w-sm grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-2xl border border-border bg-background p-4 text-sm">
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

const AssistantMessage = ({ message }: { message: ChatMessage }) => {
  const copy = () => {
    void navigator.clipboard?.writeText(message.content);
  };

  return (
    <Message className="flex w-full flex-col items-start gap-2">
      <div className="group flex w-full flex-col gap-1">
        {/* No `prose` class: the typography plugin isn't installed, so it would be a
            no-op. The text styles below are explicit instead. */}
        <MessageContent
          markdown
          className="w-full min-w-0 flex-1 bg-transparent p-0 text-sm leading-relaxed text-foreground [&_strong]:font-semibold"
        >
          {message.content}
        </MessageContent>

        {message.transactionSnapshot ? (
          <TransactionCard snapshot={message.transactionSnapshot} />
        ) : null}

        <MessageActions className="-ml-1.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
            title="Copy"
            aria-label="Copy reply"
            onClick={copy}
          >
            <Copy />
          </Button>
        </MessageActions>
      </div>
    </Message>
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
    <section className="flex min-h-0 w-full flex-1 flex-col">
      <ChatContainerRoot className="relative min-h-0 flex-1 space-y-0 overflow-y-auto">
        <ChatContainerContent className="space-y-8 py-4">
          {messages.map((message: ChatMessage) =>
            message.role === "assistant" ? (
              <AssistantMessage key={message.id} message={message} />
            ) : (
              <Message
                key={message.id}
                className="flex w-full flex-col items-end gap-2"
              >
                <MessageContent className="max-w-[85%] rounded-3xl bg-muted px-5 py-2.5 text-sm whitespace-pre-wrap text-foreground sm:max-w-[75%]">
                  {message.content}
                </MessageContent>
              </Message>
            ),
          )}

          {isPending ? (
            <Message className="flex w-full flex-col items-start gap-2">
              <DotsLoader />
            </Message>
          ) : null}

          {errors.map((error, index) => (
            <Message
              key={`error-${index}`}
              className="flex w-full flex-col items-start gap-2"
            >
              <div className="flex min-w-0 flex-row items-center gap-2 rounded-lg border-2 border-destructive/40 bg-destructive/10 px-3 py-2">
                <AlertTriangle size={16} className="shrink-0 text-destructive" />
                <p className="text-sm whitespace-pre-wrap text-destructive">
                  {error}
                </p>
              </div>
            </Message>
          ))}
        </ChatContainerContent>

        <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
          <ScrollButton />
        </div>
      </ChatContainerRoot>

      {isEmpty ? (
        <div className="flex shrink-0 flex-wrap gap-2 pb-3">
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

      <div className="shrink-0">
        <PromptInput
          value={draft}
          onValueChange={setDraft}
          onSubmit={() => send(draft)}
          isLoading={isPending}
          className="relative z-10 w-full rounded-3xl border border-input bg-popover p-0 pt-1 shadow-xs"
        >
          <div className="flex flex-col">
            <PromptInputTextarea
              placeholder="Ask anything, or log an expense"
              aria-label="Message"
              className="min-h-[44px] pt-3 pl-4 text-base leading-[1.3] sm:text-base md:text-base"
            />

            <PromptInputActions className="mt-3 flex w-full items-center justify-between gap-2 p-2">
              <div />
              {/* Not wrapped in PromptInputAction/MessageAction: their TooltipTrigger
                  renders its own button, which would nest one button inside another. */}
              <Button
                type="button"
                size="icon"
                aria-label="Send"
                title="Send"
                className="size-9 rounded-full"
                onClick={() => send(draft)}
                disabled={isPending || draft.trim().length === 0}
              >
                <ArrowUp size={18} />
              </Button>
            </PromptInputActions>
          </div>
        </PromptInput>
      </div>
    </section>
  );
};
