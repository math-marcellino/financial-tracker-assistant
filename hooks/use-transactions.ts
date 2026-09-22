"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import {
  budgetsQueryKey,
  fetchBudgets,
  fetchTransactions,
  transactionsQueryKey,
} from "@/lib/api/transactions";
import type {
  BudgetProgress,
  DashboardTransaction,
} from "@/lib/db/transactions";

/**
 * Polling, not realtime. A write from the Telegram bot happens server-side and cannot
 * push into this cache, so the dashboard asks. Paused while the tab is hidden so a
 * backgrounded tab isn't querying Postgres every five seconds forever.
 */
const POLL = {
  refetchInterval: 5000,
  refetchIntervalInBackground: false,
} as const;

export const useTransactions = (
  userId: number,
): UseQueryResult<DashboardTransaction[], Error> =>
  useQuery({
    queryKey: transactionsQueryKey(userId),
    queryFn: fetchTransactions,
    ...POLL,
  });

export const useBudgets = (
  userId: number,
): UseQueryResult<BudgetProgress[], Error> =>
  useQuery({
    queryKey: budgetsQueryKey(userId),
    queryFn: fetchBudgets,
    ...POLL,
  });
