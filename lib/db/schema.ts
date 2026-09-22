import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  check,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const transactionType = pgEnum("transaction_type", ["income", "expense"]);

export const transactionCategoryExpense = pgEnum("transaction_category_expense", [
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
]);

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
  defaultCurrency: char("default_currency", { length: 3 }).notNull().default("IDR"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
