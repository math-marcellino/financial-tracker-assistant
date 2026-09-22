import type { Content, FunctionCall } from "@google/genai";
import { and, eq } from "drizzle-orm";
import * as v from "valibot";

import { GEMINI_MODEL, getGemini } from "@/lib/agent/gemini";
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
import { budgets, transactions, users, type Transaction } from "@/lib/db/schema";

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
  ].join("\n");

/** Executes a validated call. Everything here has already passed its Valibot schema. */
const executeToolCall = async (
  name: ToolName,
  args: unknown,
  userId: number,
  defaultCurrency: string,
  now: Date,
): Promise<{ transaction: Transaction | null; result: Record<string, unknown> }> => {
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
        categoryExpense: isExpense ? (input.category as Transaction["categoryExpense"]) : null,
        categoryIncome: isExpense ? null : (input.category as Transaction["categoryIncome"]),
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
      .where(and(eq(transactions.id, input.id), eq(transactions.userId, userId)));

    if (!existing) {
      return { transaction: null, result: { status: "not_found", id: input.id } };
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

    const category = input.category ?? existing.categoryExpense ?? existing.categoryIncome;
    const isExpense = effectiveType === "expense";

    const [row] = await getDb()
      .update(transactions)
      .set({
        ...(input.amount !== undefined && { amount: input.amount.toFixed(2) }),
        ...(input.currency !== undefined && { currency: input.currency }),
        ...(input.date !== undefined && { date: input.date }),
        ...(input.note !== undefined && { note: input.note }),
        type: effectiveType,
        categoryExpense: isExpense ? (category as Transaction["categoryExpense"]) : null,
        categoryIncome: isExpense ? null : (category as Transaction["categoryIncome"]),
      })
      .where(and(eq(transactions.id, input.id), eq(transactions.userId, userId)))
      .returning();

    return { transaction: row, result: { status: "updated", id: row.id } };
  }

  if (name === "delete_transaction") {
    const input = args as DeleteTransactionArgs;

    const [row] = await getDb()
      .delete(transactions)
      .where(and(eq(transactions.id, input.id), eq(transactions.userId, userId)))
      .returning();

    return {
      transaction: null,
      result: row ? { status: "deleted", id: row.id } : { status: "not_found", id: input.id },
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
      set: { limitAmount: input.limit.toFixed(2), currency, updatedAt: new Date() },
    })
    .returning();

  return { transaction: null, result: { status: "saved", id: row.id, month } };
};

export const handleAgentMessage = async ({
  userId,
  message,
  now = new Date(),
}: HandleAgentMessageInput): Promise<AgentResult> => {
  const [user] = await getDb().select().from(users).where(eq(users.telegramId, userId));

  if (!user) {
    return { ok: false, error: `No user ${userId}.` };
  }

  const config = {
    systemInstruction: buildSystemInstruction(user.defaultCurrency, now),
    tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
  };

  const contents: Content[] = [{ role: "user", parts: [{ text: message }] }];

  const first = await getGemini().models.generateContent({
    model: GEMINI_MODEL,
    contents,
    config,
  });

  const calls: FunctionCall[] = first.functionCalls ?? [];

  // No tool fits what was asked, so the model answers in plain text. This is the correct
  // out-of-scope behaviour: there is deliberately no catch-all tool to fall back on.
  if (calls.length === 0) {
    return { ok: true, reply: first.text ?? "", transaction: null };
  }

  const [call] = calls;

  if (!call.name || !isToolName(call.name)) {
    return { ok: false, error: `Model proposed an unknown tool: ${call.name ?? "(unnamed)"}.` };
  }

  // A model's output is untrusted input, same as a form submission. Nothing below this
  // line runs unless the arguments parse.
  const parsed = v.safeParse(TOOL_SCHEMAS[call.name], call.args ?? {});

  if (!parsed.success) {
    const detail = parsed.issues
      .map((issue) => `${v.getDotPath(issue) ?? "arguments"}: ${issue.message}`)
      .join("; ");

    return { ok: false, error: `Invalid ${call.name} arguments — ${detail}` };
  }

  const { transaction, result } = await executeToolCall(
    call.name,
    parsed.output,
    userId,
    user.defaultCurrency,
    now,
  );

  const modelContent = first.candidates?.[0]?.content;

  if (modelContent) {
    contents.push(modelContent);
  }

  contents.push({
    role: "user",
    parts: [{ functionResponse: { name: call.name, response: result } }],
  });

  const second = await getGemini().models.generateContent({
    model: GEMINI_MODEL,
    contents,
    config,
  });

  return { ok: true, reply: second.text ?? "", transaction };
};
