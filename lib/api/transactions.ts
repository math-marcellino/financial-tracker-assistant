import type {
  BudgetProgress,
  DashboardTransaction,
} from "@/lib/db/transactions";

export const transactionsQueryKey = (userId: number) =>
  ["transactions", userId] as const;

export const budgetsQueryKey = (userId: number) => ["budgets", userId] as const;

export const fetchTransactions = async (): Promise<DashboardTransaction[]> => {
  const response = await fetch("/api/transactions");

  if (!response.ok) {
    throw new Error(`Failed to load transactions (${response.status}).`);
  }

  const body = (await response.json()) as {
    transactions: DashboardTransaction[];
  };

  return body.transactions;
};

export const fetchBudgets = async (): Promise<BudgetProgress[]> => {
  const response = await fetch("/api/budgets");

  if (!response.ok) {
    throw new Error(`Failed to load budgets (${response.status}).`);
  }

  const body = (await response.json()) as { budgets: BudgetProgress[] };

  return body.budgets;
};
