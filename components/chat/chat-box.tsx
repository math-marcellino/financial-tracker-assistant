"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowUp, Copy } from "lucide-react";
import { useRef, useState } from "react";

import { ModelPicker } from "@/components/chat/model-picker";
import { Button } from "@/components/ui/button";
import {
  ChatContainerContent,
  ChatContainerRoot,
} from "@/components/ui/chat-container";
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
import { ResponseStream } from "@/components/ui/response-stream";
import { ScrollButton } from "@/components/ui/scroll-button";
import { ThinkingBar } from "@/components/ui/thinking-bar";
import { useMessages } from "@/hooks/use-messages";
import { useSendMessage } from "@/hooks/use-send-message";
import { messagesQueryKey } from "@/lib/api/messages";
import { budgetsQueryKey, transactionsQueryKey } from "@/lib/api/transactions";
import { formatAmount } from "@/lib/format";
import type {
  Message as ChatMessage,
  TransactionSnapshot,
} from "@/lib/db/schema";
import { createPushStream, type PushStream } from "@/lib/push-stream";

/** Shown only on an empty thread: one per tool group, so the read tools are discoverable. */
const SUGGESTIONS = [
  "spent 45k on lunch",
  "how much did I spend on food this month?",
  "set my groceries budget to 1.5 million",
];

/** What the thinking bar says while each tool runs. Plain verbs, no jargon. */
const TOOL_LABELS: Record<string, string> = {
  add_transaction: "Recording it",
  edit_transaction: "Updating the entry",
  delete_transaction: "Removing the entry",
  set_budget: "Saving the budget",
  list_transactions: "Looking through your records",
  summarize_transactions: "Adding up the totals",
};

/**
 * Renders the snapshot stored with the turn, not the live row it came from.
 *
 * DESIGN.md § capability-card + research-table: flat white, thin rules instead of
 * boxes and shadows, uppercase mono labels for system markers, and a coral chip for
 * the category — coral is editorial taxonomy, which is exactly what a category is.
 * The amount stays ink: the sign carries it, and coral/blue must not become broad
 * decorative colour.
 */
const TransactionCard = ({ snapshot }: { snapshot: TransactionSnapshot }) => {
  const isExpense = snapshot.type === "expense";

  const rows: Array<[string, React.ReactNode]> = [
    [
      "Amount",
      <span key="amount" className="tabular-nums">
        {isExpense ? "−" : "+"}
        {formatAmount(snapshot.amount, snapshot.currency)}
      </span>,
    ],
    [
      "Category",
      <span
        key="category"
        className="co-chip-taxonomy inline-block px-2.5 py-0.5 text-[0.8125rem] capitalize"
      >
        {snapshot.category?.replace(/_/g, " ")}
      </span>,
    ],
    [
      "Date",
      <span key="date" className="tabular-nums">
        {snapshot.date}
      </span>,
    ],
    ...(snapshot.note
      ? ([["Note", snapshot.note]] as Array<[string, React.ReactNode]>)
      : []),
  ];

  return (
    <div className="mt-4 w-full max-w-md rounded-[var(--radius-sm)] border border-[var(--co-hairline)] bg-[var(--co-canvas)] px-6 py-2">
      <p className="border-b border-[var(--co-card-border)] py-3 font-mono text-[0.75rem] tracking-[0.28px] text-[var(--co-slate)] uppercase">
        {isExpense ? "Expense" : "Income"}
      </p>
      <dl>
        {rows.map(([label, value], index) => (
          <div
            key={label}
            className={`grid grid-cols-[6.5rem_1fr] items-center gap-4 py-3 text-base ${
              index < rows.length - 1
                ? "border-b border-[var(--co-card-border)]"
                : ""
            }`}
          >
            <dt className="text-[0.875rem] text-[var(--co-muted)]">{label}</dt>
            <dd className="text-[var(--co-ink)]">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
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
          className="w-full min-w-0 flex-1 bg-transparent p-0 text-base leading-[1.5] text-[var(--co-ink)] [&_strong]:font-medium"
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
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [liveStream, setLiveStream] = useState<PushStream | null>(null);
  const streamRef = useRef<PushStream | null>(null);

  const queryClient = useQueryClient();
  const { data: messages = [], isPending: isLoadingHistory } =
    useMessages(userId);

  const { mutate, isPending } = useSendMessage((event) => {
    if (event.type === "tool") {
      setActiveTool(event.name);
      return;
    }

    if (event.type === "delta") {
      // First token: the agent has stopped working and started answering.
      setActiveTool(null);
      streamRef.current?.push(event.text);
    }
  });

  const send = (text: string) => {
    const message = text.trim();

    if (!message || isPending) {
      return;
    }

    const stream = createPushStream();

    streamRef.current = stream;
    setLiveStream(stream);
    setDraft("");
    setErrors([]);
    setActiveTool(null);

    mutate(message, {
      onSuccess: (result) => {
        if (!result.ok) {
          setErrors((current) => [...current, result.error]);
        }

        // The turn is persisted server-side, so refetch rather than guessing at it.
        // A tool call may have written a transaction or a budget, so those go too.
        for (const queryKey of [
          messagesQueryKey(userId),
          transactionsQueryKey(userId),
          budgetsQueryKey(userId),
        ]) {
          void queryClient.invalidateQueries({ queryKey });
        }
      },
      // A failed request is shown, not swallowed into a cheerful placeholder reply.
      onError: (error) => {
        setErrors((current) => [...current, error.message]);
      },
      onSettled: () => {
        stream.close();
        streamRef.current = null;
        setLiveStream(null);
        setActiveTool(null);
      },
    });
  };

  const isEmpty = !isLoadingHistory && messages.length === 0;

  return (
    <section className="flex min-h-0 w-full flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--co-hairline)] pb-3">
        <span
          aria-hidden="true"
          className="size-1.5 rounded-full bg-[var(--co-deep-green)]"
        />
        <h2 className="text-base text-[var(--co-ink)]">Assistant</h2>
        <span className="font-mono text-[0.6875rem] tracking-[0.28px] text-[var(--co-muted)] uppercase">
          Web &amp; Telegram
        </span>
      </div>

      {/* Full-bleed scroller: the scrollbar belongs at the window edge, not at the
          edge of the reading column. Only one element in this tree scrolls. */}
      <ChatContainerRoot className="relative min-h-0 flex-1 space-y-0">
        <ChatContainerContent className="mx-auto w-full max-w-2xl space-y-8 px-6 py-4">
          {messages.map((message: ChatMessage) =>
            message.role === "assistant" ? (
              <AssistantMessage key={message.id} message={message} />
            ) : (
              <Message
                key={message.id}
                className="flex w-full flex-col items-end gap-2"
              >
                <MessageContent className="max-w-[85%] rounded-[var(--radius-md)] bg-[var(--co-soft-stone)] px-5 py-3 text-base leading-[1.5] whitespace-pre-wrap text-[var(--co-ink)] sm:max-w-[75%]">
                  {message.content}
                </MessageContent>
              </Message>
            ),
          )}

          {/* While a tool runs, say which one. The shimmer is the only thing moving. */}
          {isPending && activeTool ? (
            <Message className="flex w-full flex-col items-start gap-2">
              <ThinkingBar
                className="max-w-xs"
                text={TOOL_LABELS[activeTool] ?? "Working"}
              />
            </Message>
          ) : null}

          {/* Real tokens from Groq, not a replayed typewriter. */}
          {isPending && liveStream && !activeTool ? (
            <Message className="flex w-full flex-col items-start gap-2">
              <ResponseStream
                textStream={liveStream.iterable}
                mode="fade"
                className="w-full text-base leading-[1.5] text-[var(--co-ink)]"
              />
            </Message>
          ) : null}

          {isPending && !liveStream && !activeTool ? (
            <Message className="flex w-full flex-col items-start gap-2">
              <ThinkingBar className="max-w-xs" text="Thinking" />
            </Message>
          ) : null}

          {errors.map((error, index) => (
            <Message
              key={`error-${index}`}
              className="flex w-full flex-col items-start gap-2"
            >
              <div className="flex min-w-0 flex-row items-start gap-2.5 rounded-[var(--radius-sm)] border border-[var(--co-hairline)] bg-[var(--co-canvas)] px-4 py-3">
                <AlertTriangle
                  size={16}
                  className="mt-0.5 shrink-0"
                  style={{ color: "var(--co-error)" }}
                />
                <p className="text-base whitespace-pre-wrap text-[var(--co-ink)]">
                  {error}
                </p>
              </div>
            </Message>
          ))}
        </ChatContainerContent>

        <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
          <ScrollButton className="co-pill-outline rounded-full bg-[var(--co-canvas)]" />
        </div>
      </ChatContainerRoot>

      {isEmpty ? (
        <div className="mx-auto flex w-full max-w-2xl shrink-0 flex-wrap gap-2 px-6 pb-4">
          {SUGGESTIONS.map((suggestion) => (
            <PromptSuggestion
              key={suggestion}
              size="sm"
              variant="ghost"
              className="co-pill-outline px-3.5 text-[0.875rem]"
              onClick={() => send(suggestion)}
            >
              {suggestion}
            </PromptSuggestion>
          ))}
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-2xl shrink-0 px-6 pb-6">
        <PromptInput
          value={draft}
          onValueChange={setDraft}
          onSubmit={() => send(draft)}
          isLoading={isPending}
          className="relative z-10 w-full rounded-[var(--radius-xs)] border border-[var(--co-hairline)] bg-[var(--co-canvas)] p-0 pt-1 transition-[border-color] duration-150 focus-within:border-[var(--co-form-focus)]"
        >
          <div className="flex flex-col">
            <PromptInputTextarea
              placeholder="Ask anything, or log an expense"
              aria-label="Message"
              className="min-h-[46px] pt-3 pl-4 text-base leading-[1.35] sm:text-base md:text-base"
            />

            <PromptInputActions className="mt-2 flex w-full items-center justify-between gap-2 p-2">
              <div />
              {/* Not wrapped in PromptInputAction/MessageAction: their TooltipTrigger
                  renders its own button, which would nest one button inside another. */}
              <Button
                type="button"
                size="icon"
                aria-label="Send"
                title="Send"
                className="co-pill size-10 rounded-full"
                onClick={() => send(draft)}
                disabled={isPending || draft.trim().length === 0}
              >
                <ArrowUp size={18} />
              </Button>
            </PromptInputActions>
          </div>
        </PromptInput>

        <div className="flex items-center justify-between gap-3 px-1 pt-2">
          <ModelPicker userId={userId} />
        </div>
      </div>
    </section>
  );
};
