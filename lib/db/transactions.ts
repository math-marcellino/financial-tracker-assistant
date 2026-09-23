import { and, desc, eq, gte, lte, sql, sum, type SQL } from "drizzle-orm";

import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PACE_EXCLUDED_CATEGORIES,
  type AddTransactionArgs,
  type EditTransactionArgs,
  type ListTransactionsArgs,
  type SummarizeTransactionsArgs,
} from "@/lib/agent/tools";
import { getDb } from "@/lib/db";
import { budgets, transactions, type Transaction } from "@/lib/db/schema";

const DEFAULT_LIST_LIMIT = 20;

export type TransactionSummaryRow = {
  group: string;
  total: string;
  count: number;
  currency: string;
};

/**
 * The writes. The agent's tool calls and the dashboard's manual form both land here, so
 * a fix to how a transaction is stored can never reach only one of them. Callers
 * validate first: everything arriving here has already passed its Valibot schema.
 */
export const createTransactionFor = async (
  userId: number,
  input: AddTransactionArgs,
  defaultCurrency: string,
): Promise<Transaction> => {
  const isExpense = input.type === "expense";

  const [row] = await getDb()
    .insert(transactions)
    .values({
      userId,
      amount: input.amount.toFixed(2),
      currency: input.currency ?? defaultCurrency,
      type: input.type,
      // Callers see one flat category; the two-column split is ours.
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

  return row;
};

export type EditTransactionResult =
  | { status: "updated"; transaction: Transaction }
  | { status: "not_found" }
  | { status: "rejected"; reason: string };

export const editTransactionFor = async (
  userId: number,
  input: EditTransactionArgs,
): Promise<EditTransactionResult> => {
  const [existing] = await getDb()
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, input.id), eq(transactions.userId, userId)));

  if (!existing) {
    return { status: "not_found" };
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
        status: "rejected",
        reason: `Category ${input.category} does not belong to a ${effectiveType}.`,
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
    .where(and(eq(transactions.id, input.id), eq(transactions.userId, userId)))
    .returning();

  return { status: "updated", transaction: row };
};

/** Null when there was nothing to delete — the caller decides how to report that. */
export const deleteTransactionFor = async (
  userId: number,
  id: string,
): Promise<Transaction | null> => {
  const [row] = await getDb()
    .delete(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .returning();

  return row ?? null;
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

/**
 * The dashboard's feed. Newest first, scoped to the user in SQL.
 *
 * The month filter is applied in SQL rather than on the client: the result set is
 * capped, so filtering after the fact would silently show an empty month once the
 * user has more transactions than the cap.
 */
export const listRecentForUser = async (
  userId: number,
  options: { month?: string | null; limit?: number } = {},
) => {
  const { month, limit = 200 } = options;

  const filters: SQL[] = [eq(transactions.userId, userId)];

  if (month) {
    // `month` is YYYY-MM; the range is half-open so it needs no end-of-month maths.
    filters.push(
      sql`${transactions.date} >= ${`${month}-01`}::date
          AND ${transactions.date} < (${`${month}-01`}::date + interval '1 month')`,
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
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(and(...filters))
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(limit);
};

/** Months that actually have rows, newest first — the selector never offers an empty one. */
export const listTransactionMonths = async (
  userId: number,
): Promise<string[]> => {
  const rows = await getDb()
    .select({ month: sql<string>`to_char(${transactions.date}, 'YYYY-MM')` })
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .groupBy(sql`to_char(${transactions.date}, 'YYYY-MM')`)
    .orderBy(sql`to_char(${transactions.date}, 'YYYY-MM') desc`);

  return rows.map((row) => row.month);
};

export type DashboardTransaction = Awaited<
  ReturnType<typeof listRecentForUser>
>[number];

/** Below either threshold a daily rate is noise, so no pace is shown at all. */
const PACE_MIN_DAYS = 5;
const PACE_MIN_TRANSACTIONS = 3;

/** Why a budget has no pace. `ok` is the only status that carries one. */
export type PaceStatus =
  | "ok"
  | "not_current_month"
  | "excluded_category"
  | "no_spend"
  | "too_little_data";

export type BudgetPace = {
  /** Spend so far divided by days elapsed in the month, today included. */
  dailyPace: string;
  /** Where the month ends if that rate holds. */
  projectedTotal: string;
  /** The day the limit is crossed at this rate. Null when on track or already over. */
  limitDate: string | null;
};

export type BudgetProgress = {
  id: string;
  category: string;
  limitAmount: string;
  spent: string;
  currency: string;
  month: string;
  paceStatus: PaceStatus;
  pace: BudgetPace | null;
};

const isoToday = (): string => new Date().toISOString().slice(0, 10);

/**
 * Budgets with the spend they're measured against, summed by Postgres over the budget's
 * own month. Doing the arithmetic in SQL keeps it correct regardless of how many rows
 * there are, and keeps the client from having to re-derive it.
 *
 * The pace estimate is SQL too, and deliberately conservative: it only exists for the
 * month `today` falls in, once there are enough days and entries to mean something, and
 * never for categories paid in one or two lumps (rent on the 1st would read as a
 * daily rate that blows the budget by the 3rd). A projection that's wrong is worse
 * than none, so every other case returns a status and no numbers.
 */
export const listBudgetsWithSpend = async (
  userId: number,
  options: {
    month?: string | null;
    category?: string | null;
    /** YYYY-MM-DD. The agent passes its own clock; everything else uses the server's. */
    today?: string;
  } = {},
): Promise<BudgetProgress[]> => {
  const { month, category, today = isoToday() } = options;

  const filters: SQL[] = [eq(budgets.userId, userId)];

  if (month) {
    filters.push(sql`to_char(${budgets.month}, 'YYYY-MM') = ${month}`);
  }

  if (category) {
    filters.push(sql`${budgets.category}::text = ${category}`);
  }

  const base = getDb()
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
      ), 0)`.as("spent"),
      txCount: sql<number>`(
        select count(*)
        from ${transactions} t
        where t.user_id = ${budgets.userId}
          and t.type = 'expense'
          and t.category_expense = ${budgets.category}
          and date_trunc('month', t.date) = date_trunc('month', ${budgets.month})
      )::int`.as("tx_count"),
      // date - date is an integer day count in Postgres. Inclusive of today.
      daysElapsed: sql<number>`(${today}::date - ${budgets.month} + 1)`.as(
        "days_elapsed",
      ),
      daysInMonth:
        sql<number>`extract(day from (${budgets.month} + interval '1 month' - interval '1 day'))::int`.as(
          "days_in_month",
        ),
    })
    .from(budgets)
    .where(and(...filters))
    .as("b");

  const excluded = sql.join(
    PACE_EXCLUDED_CATEGORIES.map((excludedCategory) => sql`${excludedCategory}`),
    sql`, `,
  );

  const paceStatus = sql<PaceStatus>`case
    when ${base.daysElapsed} < 1 or ${base.daysElapsed} > ${base.daysInMonth} then 'not_current_month'
    when ${base.category}::text in (${excluded}) then 'excluded_category'
    when ${base.spent} = 0 then 'no_spend'
    when ${base.daysElapsed} < ${PACE_MIN_DAYS} or ${base.txCount} < ${PACE_MIN_TRANSACTIONS} then 'too_little_data'
    else 'ok'
  end`;

  const dailyRate = sql`(${base.spent}::numeric / ${base.daysElapsed})`;

  const rows = await getDb()
    .select({
      id: base.id,
      category: base.category,
      limitAmount: base.limitAmount,
      currency: base.currency,
      month: base.month,
      spent: sql<string>`${base.spent}::text`,
      paceStatus,
      dailyPace: sql<string | null>`case when ${paceStatus} = 'ok'
        then round(${dailyRate}, 2)::text end`,
      projectedTotal: sql<string | null>`case when ${paceStatus} = 'ok'
        then round(${dailyRate} * ${base.daysInMonth}, 2)::text end`,
      // Day N of the month is month + (N - 1). Only a date inside the month counts —
      // past the end means the limit holds, and an overspent budget has no future
      // crossing to predict.
      limitDate: sql<string | null>`case
        when ${paceStatus} = 'ok' and ${base.spent} < ${base.limitAmount}
          and ceil(${base.limitAmount} / ${dailyRate}) <= ${base.daysInMonth}
        then to_char(${base.month} + (ceil(${base.limitAmount} / ${dailyRate})::int - 1), 'YYYY-MM-DD')
      end`,
    })
    .from(base)
    .orderBy(desc(base.month), base.category);

  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    limitAmount: row.limitAmount,
    currency: row.currency,
    month: String(row.month).slice(0, 10),
    spent: row.spent,
    paceStatus: row.paceStatus,
    pace:
      row.dailyPace !== null && row.projectedTotal !== null
        ? {
            dailyPace: row.dailyPace,
            projectedTotal: row.projectedTotal,
            limitDate: row.limitDate,
          }
        : null,
  }));
};
