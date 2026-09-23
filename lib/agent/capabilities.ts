import type { ToolName } from "@/lib/agent/tools";

/**
 * What the agent can do, in the user's words. Web `/help` and Telegram `/start` and
 * `/help` all render this one list.
 *
 * Keyed by ToolName on purpose: adding a tool to the schema without describing it here
 * fails the typecheck, so the help text can't quietly fall behind what the agent does.
 * Type-only import, so the client bundle gets plain strings and nothing else.
 */
export type Capability = {
  title: string;
  description: string;
  example: string;
};

export const CAPABILITIES: Record<ToolName, Capability> = {
  add_transaction: {
    title: "Log income and expenses",
    description:
      "Say it the way you'd text a friend, or send a photo of a receipt.",
    example: "spent 45k on lunch",
  },
  edit_transaction: {
    title: "Fix an entry",
    description: "Change the amount, category, date or note of something logged.",
    example: "change my last lunch to 50k",
  },
  delete_transaction: {
    title: "Delete an entry",
    description: "Remove something that shouldn't be there.",
    example: "delete yesterday's grab ride",
  },
  set_budget: {
    title: "Set a monthly budget",
    description: "A spending limit for one expense category.",
    example: "set my groceries budget to 1.5 million",
  },
  list_transactions: {
    title: "Look up past entries",
    description: "Find what you logged, filtered by date, type or category.",
    example: "show my transport spending this week",
  },
  summarize_transactions: {
    title: "Get totals",
    description: "Totals by category, by month, or income against expenses.",
    example: "how much did I spend on food this month?",
  },
  get_budget_pace: {
    title: "Check your budget pace",
    description:
      "Your daily spending rate and when you'd hit the limit, once there's enough data this month.",
    example: "am I on track with my food budget?",
  },
};

/** The Telegram command menu. Registered with scripts/set-telegram-commands.ts. */
export const BOT_COMMANDS = [
  { command: "start", description: "What this bot does" },
  { command: "help", description: "Everything you can ask me" },
  { command: "login", description: "Sign in, or create your account" },
] as const;
