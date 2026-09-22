import type { FunctionDeclaration } from "@google/genai";
import * as v from "valibot";

import {
  transactionCategoryExpense,
  transactionCategoryIncome,
  transactionType,
} from "@/lib/db/schema";

/**
 * The product's capability boundary. Everything the AI is allowed to do is declared here
 * once, in two forms that must stay in lockstep: the declarations Gemini sees, and the
 * Valibot schemas our code validates against before touching Postgres.
 *
 * Adding a tool here widens what the product can do. That is a scope decision.
 */

export const EXPENSE_CATEGORIES = transactionCategoryExpense.enumValues;
export const INCOME_CATEGORIES = transactionCategoryIncome.enumValues;
export const TRANSACTION_TYPES = transactionType.enumValues;

/** numeric(14, 2) holds ten digits ahead of the decimal point. */
const MAX_AMOUNT = 9_999_999_999.99;

const AmountSchema = v.pipe(
  v.number(),
  v.finite("Amount must be a finite number."),
  v.minValue(0.01, "Amount must be greater than zero."),
  v.maxValue(MAX_AMOUNT, "Amount is larger than the database column can hold."),
);

const DateSchema = v.pipe(
  v.string(),
  v.regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD."),
  v.check((value) => !Number.isNaN(Date.parse(value)), "Date is not a real calendar date."),
);

const MonthSchema = v.pipe(v.string(), v.regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM."));

const CurrencySchema = v.pipe(
  v.string(),
  v.regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO-4217 code."),
);

const IdSchema = v.pipe(v.string(), v.uuid("Transaction id must be a UUID."));

const NoteSchema = v.pipe(v.string(), v.maxLength(500));

const CategorySchema = v.picklist(
  [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES],
  "Unknown category.",
);

const TypeSchema = v.picklist(TRANSACTION_TYPES, "Type must be 'income' or 'expense'.");

/**
 * The model gets one flat `category` argument; the two-column storage split is ours, not
 * its problem. This is where a category is checked against the type it arrived with, so
 * `salary` on an expense is rejected before the database ever sees it.
 */
const categoryMatchesType = (type: string, category: string): boolean =>
  type === "expense"
    ? (EXPENSE_CATEGORIES as readonly string[]).includes(category)
    : (INCOME_CATEGORIES as readonly string[]).includes(category);

export const AddTransactionSchema = v.pipe(
  v.object({
    amount: AmountSchema,
    type: TypeSchema,
    category: CategorySchema,
    date: DateSchema,
    note: v.optional(NoteSchema),
    currency: v.optional(CurrencySchema),
  }),
  v.forward(
    v.check(
      (input) => categoryMatchesType(input.type, input.category),
      "Category does not belong to that transaction type.",
    ),
    ["category"],
  ),
);

export const EditTransactionSchema = v.pipe(
  v.object({
    id: IdSchema,
    amount: v.optional(AmountSchema),
    type: v.optional(TypeSchema),
    category: v.optional(CategorySchema),
    date: v.optional(DateSchema),
    note: v.optional(NoteSchema),
    currency: v.optional(CurrencySchema),
  }),
  // An edit with nothing to change is a no-op that would report success.
  v.check(
    (input) => Object.keys(input).some((key) => key !== "id"),
    "Nothing to change: give at least one field besides id.",
  ),
  v.forward(
    v.check(
      (input) =>
        input.category === undefined ||
        input.type === undefined ||
        categoryMatchesType(input.type, input.category),
      "Category does not belong to that transaction type.",
    ),
    ["category"],
  ),
);

export const DeleteTransactionSchema = v.object({ id: IdSchema });

export const SetBudgetSchema = v.object({
  category: v.picklist(EXPENSE_CATEGORIES, "Budgets can only be set on expense categories."),
  limit: AmountSchema,
  month: v.optional(MonthSchema),
  currency: v.optional(CurrencySchema),
});

export const TOOL_SCHEMAS = {
  add_transaction: AddTransactionSchema,
  edit_transaction: EditTransactionSchema,
  delete_transaction: DeleteTransactionSchema,
  set_budget: SetBudgetSchema,
} as const;

export type ToolName = keyof typeof TOOL_SCHEMAS;

export const isToolName = (name: string): name is ToolName => name in TOOL_SCHEMAS;

export type AddTransactionArgs = v.InferOutput<typeof AddTransactionSchema>;
export type EditTransactionArgs = v.InferOutput<typeof EditTransactionSchema>;
export type DeleteTransactionArgs = v.InferOutput<typeof DeleteTransactionSchema>;
export type SetBudgetArgs = v.InferOutput<typeof SetBudgetSchema>;

const amountProperty = {
  type: "number",
  description: "Positive amount in major units. Expand shorthand: 45k is 45000.",
} as const;

const currencyProperty = {
  type: "string",
  description: "ISO-4217 code. Omit unless the user names a currency explicitly.",
} as const;

export const TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "add_transaction",
    description: "Record a new income or expense the user just reported.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        amount: amountProperty,
        type: { type: "string", enum: [...TRANSACTION_TYPES] },
        category: {
          type: "string",
          enum: [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES],
          description: "Must belong to the chosen type.",
        },
        date: { type: "string", description: "YYYY-MM-DD. Use today unless stated." },
        note: { type: "string", description: "Short free-text detail, if any." },
        currency: currencyProperty,
      },
      required: ["amount", "type", "category", "date"],
    },
  },
  {
    name: "edit_transaction",
    description:
      "Change fields on an existing transaction. Only call this with an id the user has been shown.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "UUID of the transaction to edit." },
        amount: amountProperty,
        type: { type: "string", enum: [...TRANSACTION_TYPES] },
        category: {
          type: "string",
          enum: [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES],
        },
        date: { type: "string", description: "YYYY-MM-DD." },
        note: { type: "string" },
        currency: currencyProperty,
      },
      required: ["id"],
    },
  },
  {
    name: "delete_transaction",
    description: "Delete a transaction the user asked to remove.",
    parametersJsonSchema: {
      type: "object",
      properties: { id: { type: "string", description: "UUID of the transaction." } },
      required: ["id"],
    },
  },
  {
    name: "set_budget",
    description: "Set or update a monthly spending limit for one expense category.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        category: { type: "string", enum: [...EXPENSE_CATEGORIES] },
        limit: amountProperty,
        month: { type: "string", description: "YYYY-MM. Defaults to the current month." },
        currency: currencyProperty,
      },
      required: ["category", "limit"],
    },
  },
];
