import { and, desc, eq, gte, lte, sql, sum, type SQL } from "drizzle-orm";

import type {
  ListTransactionsArgs,
  SummarizeTransactionsArgs,
} from "@/lib/agent/tools";
import { getDb } from "@/lib/db";
import { budgets, transactions } from "@/lib/db/schema";

const DEFAULT_LIST_LIMIT = 20;

export type TransactionSummaryRow = {
  group: string;
  total: string;
  count: number;
  currency: string;
};

/**
 * Every query is scoped to `userId` in SQL. An id the model invents can never reach
 * another user's rows.
 */
export const listTransactionsFor = async (
  userId: number,
  args: ListTransactionsArgs,
) => {
  const filters: SQL[] = [eq(transactions.userId, userId)];

  if (args.from) filters.push(gte(transactions.date, args.from));
  if (args.to) filters.push(lte(transactions.date, args.to));
  if (args.type) filters.push(eq(transactions.type, args.type));

  if (args.category) {
    // The model passes one flat category; it matches whichever column holds it. Both
    // columns are cast to text first: comparing the bound value against the enum directly
    // makes Postgres try to coerce e.g. 'groceries' into transaction_category_income,
    // which is a 22P02 rather than simply no match.
    filters.push(
      sql`(${transactions.categoryExpense}::text = ${args.category} OR ${transactions.categoryIncome}::text = ${args.category})`,
    );
  }

  return getDb()
    .select({
      id: transactions.id,
      amount: transactions.amount,
      currency: transactions.currency,
      type: transactions.type,
      categoryExpense: transactions.categoryExpense,
      categoryIncome: transactions.categoryIncome,
      date: transactions.date,
      note: transactions.note,
    })
    .from(transactions)
    .where(and(...filters))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(args.limit ?? DEFAULT_LIST_LIMIT);
};

/**
 * Totals come from Postgres, never from the model. An LLM adding up forty rupiah amounts
 * is wrong often enough to matter, and a silently wrong total is the worst failure mode
 * this app has.
 */
export const summarizeTransactionsFor = async (
  userId: number,
  args: SummarizeTransactionsArgs,
): Promise<TransactionSummaryRow[]> => {
  const groupExpression =
    args.groupBy === "category"
      ? sql<string>`coalesce(${transactions.categoryExpense}::text, ${transactions.categoryIncome}::text)`
      : args.groupBy === "type"
        ? sql<string>`${transactions.type}::text`
        : sql<string>`to_char(${transactions.date}, 'YYYY-MM')`;

  const rows = await getDb()
    .select({
      group: groupExpression,
      total: sum(transactions.amount),
      count: sql<number>`count(*)::int`,
      currency: transactions.currency,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        gte(transactions.date, args.from),
        lte(transactions.date, args.to),
      ),
    )
    // Grouped by currency too: summing IDR and USD into one number would be nonsense.
    .groupBy(groupExpression, transactions.currency)
    .orderBy(desc(sum(transactions.amount)));

  return rows.map((row) => ({
    group: row.group,
    total: row.total ?? "0",
    count: row.count,
    currency: row.currency,
  }));
};

/** The dashboard's feed. Newest first, scoped to the user in SQL. */
export const listRecentForUser = async (userId: number, limit = 200) =>
  getDb()
    .select({
      id: transactions.id,
      amount: transactions.amount,
      currency: transactions.currency,
      type: transactions.type,
      categoryExpense: transactions.categoryExpense,
      categoryIncome: transactions.categoryIncome,
      date: transactions.date,
      note: transactions.note,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(limit);

export type DashboardTransaction = Awaited<
  ReturnType<typeof listRecentForUser>
>[number];

export type BudgetProgress = {
  id: string;
  category: string;
  limitAmount: string;
  spent: string;
  currency: string;
  month: string;
};

/**
 * Budgets with the spend they're measured against, summed by Postgres over the budget's
 * own month. Doing the arithmetic in SQL keeps it correct regardless of how many rows
 * there are, and keeps the client from having to re-derive it.
 */
export const listBudgetsWithSpend = async (
  userId: number,
): Promise<BudgetProgress[]> => {
  const rows = await getDb()
    .select({
      id: budgets.id,
      category: budgets.category,
      limitAmount: budgets.limitAmount,
      currency: budgets.currency,
      month: budgets.month,
      spent: sql<string>`coalesce((
        select sum(t.amount)
        from ${transactions} t
        where t.user_id = ${budgets.userId}
          and t.type = 'expense'
          and t.category_expense = ${budgets.category}
          and date_trunc('month', t.date) = date_trunc('month', ${budgets.month})
      ), 0)::text`,
    })
    .from(budgets)
    .where(eq(budgets.userId, userId))
    .orderBy(desc(budgets.month), budgets.category);

  return rows.map((row) => ({
    ...row,
    month: String(row.month).slice(0, 10),
  }));
};
