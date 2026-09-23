import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { LLM_MODEL, getGroq } from "@/lib/agent/llm";
import { resolveModel } from "@/lib/agent/models";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  TOOL_DECLARATIONS,
  TOOL_SCHEMAS,
  isToolName,
  type AddTransactionArgs,
  type DeleteTransactionArgs,
  type EditTransactionArgs,
  type ListTransactionsArgs,
  type SetBudgetArgs,
  type SummarizeTransactionsArgs,
  type ToolName,
} from "@/lib/agent/tools";
import { getDb } from "@/lib/db";
import { appendMessage, listMessages } from "@/lib/db/messages";
import {
  budgets,
  transactions,
  users,
  type Message,
  type Transaction,
  type TransactionSnapshot,
} from "@/lib/db/schema";
import {
  listTransactionsFor,
  summarizeTransactionsFor,
} from "@/lib/db/transactions";

/**
 * The single canonical implementation of the agent loop. A plain function on purpose: no
 * "use server", no framework imports, no Request in the signature. The Route Handler (web
 * chat, Telegram webhook) and any future Server Action are thin wrappers around this, so
 * parsing and categorization logic never gets duplicated or fixed in only one place.
 */

export type AgentResult =
  | { ok: true; reply: string; transaction: Transaction | null }
  | { ok: false; error: string };

/**
 * What the loop emits as it runs. `tool` fires when a tool starts, so the UI can say what
 * the agent is actually doing rather than showing a generic spinner; `delta` carries real
 * tokens from Groq, not a replayed typewriter.
 */
export type AgentEvent =
  | { type: "tool"; name: ToolName }
  | { type: "delta"; text: string }
  | { type: "done"; reply: string; transaction: Transaction | null }
  | { type: "error"; error: string };

export type HandleAgentMessageInput = {
  userId: number;
  message: string;
  /** Which surface the message came from. Both share one thread per user. */
  source?: "web" | "telegram";
  /** Injectable so the caller controls "today"; defaults to the server's clock. */
  now?: Date;
};

/**
 * A read tool can be followed by a write tool, so the loop has to run more than once.
 * The cap stops a confused model burning the API quota; hitting it is reported, never
 * papered over with a partial answer.
 */
const MAX_STEPS = 5;

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * Cleans up two artifacts gpt-oss-120b intermittently emits.
 *
 * 1. Empty emphasis runs like `**   **`, which carry no meaning.
 * 2. A degenerate first attempt followed by a blank line and a corrected one — seen on
 *    non-English input, e.g. `Your expense — ? ? — ? ?\n\nYour expense for coffee has
 *    been recorded.` The system instruction already asks for one short sentence, so a
 *    multi-paragraph reply is off-contract and the last paragraph is the real answer.
 *
 * Neither rule can touch a well-formed single-sentence reply, which is the whole point:
 * a heuristic that eats good output would be worse than the occasional odd one.
 */
const normalizeReply = (reply: string): string => {
  const cleaned = reply
    // Whitespace between the markers is required: without it the single-character
    // alternative matches the two asterisks of a real `**bold**` run and eats it.
    .replace(/(\*\*|__)\s+\1/g, "")
    .replace(/(?<![*_])([*_])\s+\1(?![*_])/g, "")
    .trim();

  const paragraphs = cleaned
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean);

  return (paragraphs.at(-1) ?? cleaned).replace(/\n{2,}/g, "\n").trim();
};

/** Keeps the upstream message intact rather than flattening it to "something went wrong". */
const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const buildSystemInstruction = (defaultCurrency: string, now: Date): string =>
  [
    "You are a personal finance tracker. The user logs income and expenses in plain language.",
    `Today is ${toIsoDate(now)}. Resolve relative dates ("today", "yesterday") against it.`,
    `The user's default currency is ${defaultCurrency}. Only pass a currency argument when the user names a different one explicitly.`,
    "Amounts are in major units. Expand shorthand before calling a tool: 45k means 45000, 1.5jt and 1.5m mean 1500000.",
    `Expense categories: ${EXPENSE_CATEGORIES.join(", ")}.`,
    `Income categories: ${INCOME_CATEGORIES.join(", ")}.`,
    "The category you pass must belong to the type you pass.",
    "If the user asks for something no tool covers, answer in plain text. Never force an unrelated tool call.",
    "To answer questions about past spending, call list_transactions or summarize_transactions. Never guess at figures or rely on the conversation for them.",
    "When the user refers to a transaction in words ('my last grocery entry'), call list_transactions first to get its id, then edit or delete it.",
    // The chatbox renders markdown now, but only inline emphasis is styled: headings and
    // lists would come out unstyled, since the typography plugin isn't installed.
    "Keep replies to one short sentence. You may use **bold** for an amount. No headings, no bullet lists, no code blocks.",
    "The transaction details are displayed separately, so do not restate every field.",
  ].join("\n");

/** Executes a validated call. Everything here has already passed its Valibot schema. */
const executeToolCall = async (
  name: ToolName,
  args: unknown,
  userId: number,
  defaultCurrency: string,
  now: Date,
): Promise<{
  transaction: Transaction | null;
  result: Record<string, unknown>;
}> => {
  if (name === "add_transaction") {
    const input = args as AddTransactionArgs;
    const isExpense = input.type === "expense";

    const [row] = await getDb()
      .insert(transactions)
      .values({
        userId,
        amount: input.amount.toFixed(2),
        currency: input.currency ?? defaultCurrency,
        type: input.type,
        // The model sees one flat category; the two-column split is ours.
        categoryExpense: isExpense
          ? (input.category as Transaction["categoryExpense"])
          : null,
        categoryIncome: isExpense
          ? null
          : (input.category as Transaction["categoryIncome"]),
        date: input.date,
        note: input.note ?? null,
      })
      .returning();

    return { transaction: row, result: { status: "created", id: row.id } };
  }

  if (name === "edit_transaction") {
    const input = args as EditTransactionArgs;

    const [existing] = await getDb()
      .select()
      .from(transactions)
      .where(
        and(eq(transactions.id, input.id), eq(transactions.userId, userId)),
      );

    if (!existing) {
      return {
        transaction: null,
        result: { status: "not_found", id: input.id },
      };
    }

    // A category can arrive without a type, so the effective type has to come from the
    // stored row before we know which column it belongs in.
    const effectiveType = input.type ?? existing.type;

    if (input.category !== undefined) {
      const allowed =
        effectiveType === "expense"
          ? (EXPENSE_CATEGORIES as readonly string[])
          : (INCOME_CATEGORIES as readonly string[]);

      if (!allowed.includes(input.category)) {
        return {
          transaction: null,
          result: {
            status: "rejected",
            reason: `Category ${input.category} does not belong to a ${effectiveType}.`,
          },
        };
      }
    }

    const category =
      input.category ?? existing.categoryExpense ?? existing.categoryIncome;
    const isExpense = effectiveType === "expense";

    const [row] = await getDb()
      .update(transactions)
      .set({
        ...(input.amount !== undefined && { amount: input.amount.toFixed(2) }),
        ...(input.currency !== undefined && { currency: input.currency }),
        ...(input.date !== undefined && { date: input.date }),
        ...(input.note !== undefined && { note: input.note }),
        type: effectiveType,
        categoryExpense: isExpense
          ? (category as Transaction["categoryExpense"])
          : null,
        categoryIncome: isExpense
          ? null
          : (category as Transaction["categoryIncome"]),
      })
      .where(
        and(eq(transactions.id, input.id), eq(transactions.userId, userId)),
      )
      .returning();

    return { transaction: row, result: { status: "updated", id: row.id } };
  }

  if (name === "delete_transaction") {
    const input = args as DeleteTransactionArgs;

    const [row] = await getDb()
      .delete(transactions)
      .where(
        and(eq(transactions.id, input.id), eq(transactions.userId, userId)),
      )
      .returning();

    return {
      transaction: null,
      result: row
        ? { status: "deleted", id: row.id }
        : { status: "not_found", id: input.id },
    };
  }

  if (name === "list_transactions") {
    const rows = await listTransactionsFor(
      userId,
      args as ListTransactionsArgs,
    );

    return {
      transaction: null,
      result: {
        count: rows.length,
        transactions: rows.map((row) => ({
          id: row.id,
          amount: row.amount,
          currency: row.currency,
          type: row.type,
          category: row.categoryExpense ?? row.categoryIncome,
          date: row.date,
          note: row.note,
        })),
      },
    };
  }

  if (name === "summarize_transactions") {
    const rows = await summarizeTransactionsFor(
      userId,
      args as SummarizeTransactionsArgs,
    );

    return { transaction: null, result: { groups: rows } };
  }

  const input = args as SetBudgetArgs;
  const month = input.month ?? toIsoDate(now).slice(0, 7);
  const currency = input.currency ?? defaultCurrency;

  const [row] = await getDb()
    .insert(budgets)
    .values({
      userId,
      category: input.category,
      limitAmount: input.limit.toFixed(2),
      currency,
      month: `${month}-01`,
    })
    .onConflictDoUpdate({
      target: [budgets.userId, budgets.category, budgets.month],
      set: {
        limitAmount: input.limit.toFixed(2),
        currency,
        updatedAt: new Date(),
      },
    })
    .returning();

  return { transaction: null, result: { status: "saved", id: row.id, month } };
};

/** Frozen at the time of the turn, so the card can never drift from the reply text. */
const toSnapshot = (transaction: Transaction): TransactionSnapshot => ({
  id: transaction.id,
  amount: transaction.amount,
  currency: transaction.currency,
  type: transaction.type,
  category: transaction.categoryExpense ?? transaction.categoryIncome,
  date: transaction.date,
  note: transaction.note,
});

/** Stored turns replay as plain text; tool traffic is never persisted or replayed. */
const toChatMessage = (row: Message): ChatCompletionMessageParam =>
  row.role === "user"
    ? { role: "user", content: row.content }
    : { role: "assistant", content: row.content };

/**
 * The canonical loop. `handleAgentMessage` below is a thin collector over this, so the
 * Telegram webhook and the web chat share one implementation — streaming is a transport
 * detail, not a second code path.
 */
export async function* streamAgentMessage({
  userId,
  message,
  source = "web",
  now = new Date(),
}: HandleAgentMessageInput): AsyncGenerator<AgentEvent> {
  const [user] = await getDb()
    .select()
    .from(users)
    .where(eq(users.telegramId, userId));

  if (!user) {
    yield { type: "error", error: `No user ${userId}.` };
    return;
  }

  // The stored preference is still untrusted at this point: it may name a model Groq
  // has since retired, so it is checked against the live list before use.
  const model = await resolveModel(user.preferredModel, LLM_MODEL);

  const history = await listMessages(userId);

  const working: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: buildSystemInstruction(user.defaultCurrency, now),
    },
    ...history.map(toChatMessage),
    { role: "user", content: message },
  ];

  // The transaction the UI shows: whichever one the last write touched.
  let affected: Transaction | null = null;

  for (let step = 0; step < MAX_STEPS; step += 1) {
    let content = "";
    // tool_calls arrive split across chunks and must be reassembled by index.
    const partials: Array<{ id?: string; name?: string; args: string }> = [];

    try {
      const stream = await getGroq().chat.completions.create({
        model,
        messages: working,
        tools: TOOL_DECLARATIONS,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          content += delta.content;
          yield { type: "delta", text: delta.content };
        }

        for (const call of delta?.tool_calls ?? []) {
          const index = call.index ?? 0;
          const partial = (partials[index] ??= { args: "" });

          if (call.id) partial.id = call.id;
          if (call.function?.name) partial.name = call.function.name;
          if (call.function?.arguments) partial.args += call.function.arguments;
        }
      }
    } catch (error) {
      // Surfaced, not swallowed: the caller gets the real upstream message.
      yield {
        type: "error",
        error: `LLM call failed: ${describeError(error)}`,
      };
      return;
    }

    // No tool fits, so the model answered in plain text. This is the correct
    // out-of-scope behaviour: there is deliberately no catch-all tool.
    if (partials.length === 0) {
      const reply = normalizeReply(content);

      await appendMessage({ userId, role: "user", source, content: message });
      await appendMessage({
        userId,
        role: "assistant",
        source,
        content: reply,
        transactionId: affected?.id ?? null,
        transactionSnapshot: affected ? toSnapshot(affected) : null,
      });

      yield { type: "done", reply, transaction: affected };
      return;
    }

    working.push({
      role: "assistant",
      content: content || null,
      tool_calls: partials.map((partial, index) => ({
        id: partial.id ?? `call_${index}`,
        type: "function" as const,
        function: { name: partial.name ?? "", arguments: partial.args || "{}" },
      })),
    });

    // Every tool_call needs a matching tool message. Answering only the first is a
    // 400 on the next turn, so the whole batch is executed.
    for (const [index, partial] of partials.entries()) {
      const name = partial.name;

      if (!name || !isToolName(name)) {
        yield {
          type: "error",
          error: `Model proposed an unknown tool: ${name ?? "(unnamed)"}.`,
        };
        return;
      }

      yield { type: "tool", name };

      // Arguments arrive as a JSON *string*, so malformed JSON is its own failure mode.
      let rawArgs: unknown;

      try {
        rawArgs = JSON.parse(partial.args || "{}");
      } catch (error) {
        yield {
          type: "error",
          error: `Model sent unparseable ${name} arguments: ${describeError(error)}`,
        };
        return;
      }

      // A model's output is untrusted input, same as a form submission. Nothing below
      // this line runs unless the arguments parse.
      const parsed = v.safeParse(TOOL_SCHEMAS[name], rawArgs);

      if (!parsed.success) {
        const detail = parsed.issues
          .map(
            (issue) =>
              `${v.getDotPath(issue) ?? "arguments"}: ${issue.message}`,
          )
          .join("; ");

        yield { type: "error", error: `Invalid ${name} arguments — ${detail}` };
        return;
      }

      const { transaction, result } = await executeToolCall(
        name,
        parsed.output,
        userId,
        user.defaultCurrency,
        now,
      );

      if (transaction) {
        affected = transaction;
      }

      working.push({
        role: "tool",
        tool_call_id: partial.id ?? `call_${index}`,
        content: JSON.stringify(result),
      });
    }
  }

  // Reported rather than papered over with whatever partial text is to hand.
  yield {
    type: "error",
    error: `The agent did not finish within ${MAX_STEPS} steps.`,
  };
}

/** Collects the stream into one result, for callers that can't consume a stream. */
export const handleAgentMessage = async (
  input: HandleAgentMessageInput,
): Promise<AgentResult> => {
  for await (const event of streamAgentMessage(input)) {
    if (event.type === "error") {
      return { ok: false, error: event.error };
    }

    if (event.type === "done") {
      return { ok: true, reply: event.reply, transaction: event.transaction };
    }
  }

  return { ok: false, error: "The agent produced no result." };
};
