import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const transactionType = pgEnum("transaction_type", [
  "income",
  "expense",
]);

export const transactionCategoryExpense = pgEnum(
  "transaction_category_expense",
  [
    "food_drink",
    "groceries",
    "transport",
    "housing",
    "utilities",
    "health",
    "shopping",
    "entertainment",
    "education",
    "travel",
    "subscriptions",
    "fees_charges",
    "gifts_donations",
    "other",
  ],
);

export const transactionCategoryIncome = pgEnum("transaction_category_income", [
  "salary",
  "bonus",
  "freelance",
  "investment",
  "refund",
  "gift",
  "other",
]);

export const users = pgTable("users", {
  // Telegram IDs exceed int4 and are documented to stay inside JS's safe-integer range.
  telegramId: bigint("telegram_id", { mode: "number" }).primaryKey(),
  // Optional and user-changeable on Telegram's side: display only, never an identifier.
  username: text("username"),
  firstName: text("first_name"),
  defaultCurrency: char("default_currency", { length: 3 })
    .notNull()
    .default("IDR"),
  // Null means "use the app default". Validated against Groq's live model list on
  // every request, so a stale or tampered value can never reach the API.
  preferredModel: text("preferred_model"),
  /**
   * Bumped to invalidate every session cookie for this account at once.
   *
   * Telegram's Login Widget is a one-shot identity assertion with no way to ask
   * whether a user has since revoked the app, so revocation can only be enforced from
   * our side. This is that lever.
   */
  sessionEpoch: integer("session_epoch").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.telegramId, { onDelete: "cascade" }),
    // Exact money, never float. Drizzle returns numeric as string; it stays a string
    // end-to-end and is parsed only at the edges.
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    type: transactionType("type").notNull(),
    categoryExpense: transactionCategoryExpense("category_expense"),
    categoryIncome: transactionCategoryIncome("category_income"),
    // The calendar day of the transaction, distinct from created_at below.
    date: date("date").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("transactions_user_id_date_idx").on(table.userId, table.date),
    // Exactly one category column is set, and it is the one matching `type`. The split
    // enums exist so the database itself refuses `salary` on an expense row.
    check(
      "transactions_category_matches_type",
      sql`(${table.type} = 'expense' AND ${table.categoryExpense} IS NOT NULL AND ${table.categoryIncome} IS NULL)
       OR (${table.type} = 'income' AND ${table.categoryIncome} IS NOT NULL AND ${table.categoryExpense} IS NULL)`,
    ),
  ],
);

export const budgets = pgTable(
  "budgets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.telegramId, { onDelete: "cascade" }),
    // Expense categories only: a budget on `salary` is meaningless, and reusing the
    // expense enum means the database is what enforces that.
    category: transactionCategoryExpense("category").notNull(),
    limitAmount: numeric("limit_amount", { precision: 14, scale: 2 }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    // Always the 1st of the month the budget applies to.
    month: date("month").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // What makes set_budget an upsert rather than a duplicate-row generator.
    uniqueIndex("budgets_user_id_category_month_idx").on(
      table.userId,
      table.category,
      table.month,
    ),
  ],
);

/** The transaction fields the chat card renders, frozen at the time of the turn. */
export type TransactionSnapshot = {
  id: string;
  amount: string;
  currency: string;
  type: "income" | "expense";
  category: string | null;
  date: string;
  note: string | null;
};

export const messageRole = pgEnum("message_role", ["user", "assistant"]);
export const messageSource = pgEnum("message_source", ["web", "telegram"]);

/**
 * Only user and assistant *text* turns are stored — never tool_calls or tool results.
 * An OpenAI-compatible API rejects a replay window that separates a tool_call from its
 * matching tool message; storing text only makes that impossible by construction.
 * Nothing is lost, because facts come from the read tools, not from replayed tool output.
 */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: bigint("user_id", { mode: "number" })
      .notNull()
      .references(() => users.telegramId, { onDelete: "cascade" }),
    role: messageRole("role").notNull(),
    // One thread per user across both surfaces, which already share telegram_id.
    source: messageSource("source").notNull(),
    content: text("content").notNull(),
    // Which row this turn touched. `set null` so deleting a transaction doesn't take the
    // message that announced it.
    transactionId: uuid("transaction_id").references(() => transactions.id, {
      onDelete: "set null",
    }),
    // The values as they were when this turn happened. The reply text is frozen prose, so
    // a card rendered from the live row would contradict the sentence above it the moment
    // the transaction is edited. A transcript records what happened, not what is true now.
    transactionSnapshot: jsonb(
      "transaction_snapshot",
    ).$type<TransactionSnapshot>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("messages_user_id_created_at_idx").on(table.userId, table.createdAt),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
