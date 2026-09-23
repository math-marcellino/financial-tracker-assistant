import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";
import { eq } from "drizzle-orm";
import * as v from "valibot";

import { LLM_MODEL, getGroq } from "@/lib/agent/llm";
import { resolveModel, resolveVisionModel } from "@/lib/agent/models";
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
  users,
  type Message,
  type Transaction,
  type TransactionSnapshot,
} from "@/lib/db/schema";
import {
  createTransactionFor,
  deleteTransactionFor,
  editTransactionFor,
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

/** A receipt or invoice photo, as a data URL. Never stored — read once, then dropped. */
export type ImageInput = { dataUrl: string };

export type HandleAgentMessageInput = {
  userId: number;
  message: string;
  image?: ImageInput;
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
    // Money arriving is not the same as money earned. A transfer between the user's
    // own accounts changes no net worth, so logging it as income inflates every total
    // it touches — and a wrong income figure is worse than a missing one.
    "NEVER log income unless the user explicitly says the money was earned or received from someone else — a salary, a bonus, a refund, a gift, a client payment, an investment return.",
    "Moving money between the user's own accounts is NOT income and NOT an expense. Withdrawing cash, topping up an e-wallet, transferring to savings, paying off a credit card, or cashing out — none of these change what the user is worth, so do not record them.",
    "If a message could be either a transfer or real income, do not guess and do not call a tool. Reply with one short question asking which it was.",
    "If the user asks for something no tool covers, answer in plain text. Never force an unrelated tool call.",
    // The image is read once and discarded, so nothing downstream can re-check it.
    "When given a photo of a receipt, bill or invoice: read the FINAL total the customer paid, including tax and service charge, and log it as ONE transaction. Do not log a row per line item.",
    "Put the merchant name in the note. Use the date printed on the receipt; if there is none, use today.",
    "If the total, the date or the currency is unreadable, do not guess — say which part you could not read and ask for it.",
    // Out-of-scope answers were inventing exchange rates and app features. A made-up
    // figure in a finance tool is worse than "I don't know" — it looks authoritative.
    "Never state an exchange rate, market price, or any financial figure you did not get from a tool. If you do not have it, say you do not have it.",
    "Do not give investment, tax, or legal advice. Say it is outside what you do.",
    "Only describe features you actually have: logging, editing, deleting, budgets, and answering questions about recorded transactions.",
    "Do not suggest exporting, downloading, emailing, generating a report or a CSV, or contacting support. Those do not exist here. When asked for one, say plainly that it is not something this assistant can do, and stop there — do not propose a workaround.",
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
    const row = await createTransactionFor(
      userId,
      args as AddTransactionArgs,
      defaultCurrency,
    );

    return { transaction: row, result: { status: "created", id: row.id } };
  }

  if (name === "edit_transaction") {
    const input = args as EditTransactionArgs;
    const outcome = await editTransactionFor(userId, input);

    if (outcome.status === "not_found") {
      return {
        transaction: null,
        result: { status: "not_found", id: input.id },
      };
    }

    if (outcome.status === "rejected") {
      return {
        transaction: null,
        result: { status: "rejected", reason: outcome.reason },
      };
    }

    return {
      transaction: outcome.transaction,
      result: { status: "updated", id: outcome.transaction.id },
    };
  }

  if (name === "delete_transaction") {
    const input = args as DeleteTransactionArgs;
    const row = await deleteTransactionFor(userId, input.id);

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
  image,
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
  //
  // This call reaches Groq, so it fails on a bad key just like the completion does —
  // and it sits before the loop's own try, so without this guard the error escaped the
  // generator entirely and arrived with no context about what was being attempted.
  let model: string;

  try {
    model = await resolveModel(user.preferredModel, LLM_MODEL);

    if (image) {
      // A text-only model rejects the whole request rather than ignoring the image,
      // so the preference is overridden here instead of failing downstream.
      const visionModel = await resolveVisionModel(model);

      if (!visionModel) {
        yield {
          type: "error",
          error:
            "None of the models available on this account can read images. Try describing the receipt instead.",
        };

        return;
      }

      model = visionModel;
    }
  } catch (error) {
    yield {
      type: "error",
      error: `Could not reach Groq to check the model list: ${describeError(error)}`,
    };
    return;
  }

  const history = await listMessages(userId);

  const working: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: buildSystemInstruction(user.defaultCurrency, now),
    },
    ...history.map(toChatMessage),
    image
      ? {
          role: "user" as const,
          content: [
            { type: "text" as const, text: message },
            {
              type: "image_url" as const,
              image_url: { url: image.dataUrl },
            },
          ],
        }
      : { role: "user" as const, content: message },
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
