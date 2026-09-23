import type {
  BudgetProgress,
  DashboardTransaction,
} from "@/lib/db/transactions";

/**
 * Month is part of the key, but after userId — so invalidating the prefix
 * ["transactions", userId] still clears every month, per CLAUDE.md.
 */
export const transactionsQueryKey = (userId: number, month?: string | null) =>
  ["transactions", userId, month ?? "all"] as const;

export const budgetsQueryKey = (userId: number, month?: string | null) =>
  ["budgets", userId, month ?? "all"] as const;

export const monthsQueryKey = (userId: number) => ["months", userId] as const;

const withMonth = (path: string, month?: string | null): string =>
  month ? `${path}?month=${encodeURIComponent(month)}` : path;

export const fetchTransactions = async (
  month?: string | null,
): Promise<DashboardTransaction[]> => {
  const response = await fetch(withMonth("/api/transactions", month));

  if (!response.ok) {
    throw new Error(`Failed to load transactions (${response.status}).`);
  }

  const body = (await response.json()) as {
    transactions: DashboardTransaction[];
  };

  return body.transactions;
};

export const fetchBudgets = async (
  month?: string | null,
): Promise<BudgetProgress[]> => {
  const response = await fetch(withMonth("/api/budgets", month));

  if (!response.ok) {
    throw new Error(`Failed to load budgets (${response.status}).`);
  }

  const body = (await response.json()) as { budgets: BudgetProgress[] };

  return body.budgets;
};

export const fetchMonths = async (): Promise<string[]> => {
  const response = await fetch("/api/months");

  if (!response.ok) {
    throw new Error(`Failed to load months (${response.status}).`);
  }

  const body = (await response.json()) as { months: string[] };

  return body.months;
};
