import type {
  ChatCompletion,
  ChatCompletionMessageParam,
} from "groq-sdk/resources/chat/completions";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { LLM_MODEL, getGroq } from "@/lib/agent/llm";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  TOOL_DECLARATIONS,
  TOOL_SCHEMAS,
  isToolName,
  type AddTransactionArgs,
  type DeleteTransactionArgs,
  type EditTransactionArgs,
  type SetBudgetArgs,
  type ToolName,
} from "@/lib/agent/tools";
import { getDb } from "@/lib/db";
import {
  budgets,
  transactions,
  users,
  type Transaction,
} from "@/lib/db/schema";

/**
 * The single canonical implementation of the agent loop. A plain function on purpose: no
 * "use server", no framework imports, no Request in the signature. The Route Handler (web
 * chat, Telegram webhook) and any future Server Action are thin wrappers around this, so
 * parsing and categorization logic never gets duplicated or fixed in only one place.
 */

export type AgentResult =
  | { ok: true; reply: string; transaction: Transaction | null }
  | { ok: false; error: string };

export type HandleAgentMessageInput = {
  userId: number;
  message: string;
  /** Injectable so the caller controls "today"; defaults to the server's clock. */
  now?: Date;
};

const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

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
    // The chatbox renders replies as plain text, so markdown syntax would show literally.
    "Reply in plain prose. Do not use markdown: no asterisks for emphasis, no bullet lists, no headings.",
    "Keep replies to one short sentence. The transaction details are displayed separately, so do not restate every field.",
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

export const handleAgentMessage = async ({
  userId,
  message,
  now = new Date(),
}: HandleAgentMessageInput): Promise<AgentResult> => {
  const [user] = await getDb()
    .select()
    .from(users)
    .where(eq(users.telegramId, userId));

  if (!user) {
    return { ok: false, error: `No user ${userId}.` };
  }

  const messages: ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: buildSystemInstruction(user.defaultCurrency, now),
    },
    { role: "user", content: message },
  ];

  let first: ChatCompletion;

  try {
    first = await getGroq().chat.completions.create({
      model: LLM_MODEL,
      messages,
      tools: TOOL_DECLARATIONS,
    });
  } catch (error) {
    // Surfaced, not swallowed: the caller gets the real upstream message instead of an
    // opaque 500, and no tool runs.
    return { ok: false, error: `LLM call failed: ${describeError(error)}` };
  }

  const assistant = first.choices[0]?.message;
  const calls = assistant?.tool_calls ?? [];

  // No tool fits what was asked, so the model answers in plain text. This is the correct
  // out-of-scope behaviour: there is deliberately no catch-all tool to fall back on.
  if (calls.length === 0) {
    return { ok: true, reply: assistant?.content ?? "", transaction: null };
  }

  const [call] = calls;
  const name = call.function?.name;

  if (!name || !isToolName(name)) {
    return {
      ok: false,
      error: `Model proposed an unknown tool: ${name ?? "(unnamed)"}.`,
    };
  }

  // Arguments arrive as a JSON *string*, so malformed JSON is its own failure mode and
  // must not throw past the caller.
  let rawArgs: unknown;

  try {
    rawArgs = JSON.parse(call.function?.arguments || "{}");
  } catch (error) {
    return {
      ok: false,
      error: `Model sent unparseable ${name} arguments: ${describeError(error)}`,
    };
  }

  // A model's output is untrusted input, same as a form submission. Nothing below this
  // line runs unless the arguments parse.
  const parsed = v.safeParse(TOOL_SCHEMAS[name], rawArgs);

  if (!parsed.success) {
    const detail = parsed.issues
      .map((issue) => `${v.getDotPath(issue) ?? "arguments"}: ${issue.message}`)
      .join("; ");

    return { ok: false, error: `Invalid ${name} arguments — ${detail}` };
  }

  const { transaction, result } = await executeToolCall(
    name,
    parsed.output,
    userId,
    user.defaultCurrency,
    now,
  );

  messages.push(assistant);
  messages.push({
    role: "tool",
    tool_call_id: call.id,
    content: JSON.stringify(result),
  });

  // The write already landed, so a failure here must not read as "nothing happened". The
  // transaction is still returned; only the closing sentence is missing.
  try {
    const second = await getGroq().chat.completions.create({
      model: LLM_MODEL,
      messages,
      tools: TOOL_DECLARATIONS,
    });

    return {
      ok: true,
      reply: second.choices[0]?.message?.content ?? "",
      transaction,
    };
  } catch (error) {
    return {
      ok: true,
      reply: `Saved, but the model did not return a confirmation: ${describeError(error)}`,
      transaction,
    };
  }
};
