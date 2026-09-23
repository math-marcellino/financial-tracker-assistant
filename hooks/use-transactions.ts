"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import {
  budgetsQueryKey,
  fetchBudgets,
  fetchMonths,
  fetchTransactions,
  monthsQueryKey,
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
  month?: string | null,
): UseQueryResult<DashboardTransaction[], Error> =>
  useQuery({
    queryKey: transactionsQueryKey(userId, month),
    queryFn: () => fetchTransactions(month),
    // Keeps the previous month's rows on screen while the new month loads, so
    // switching months doesn't flash an empty table.
    placeholderData: (previous) => previous,
    ...POLL,
  });

export const useBudgets = (
  userId: number,
  month?: string | null,
): UseQueryResult<BudgetProgress[], Error> =>
  useQuery({
    queryKey: budgetsQueryKey(userId, month),
    queryFn: () => fetchBudgets(month),
    placeholderData: (previous) => previous,
    ...POLL,
  });

export const useMonths = (userId: number): UseQueryResult<string[], Error> =>
  useQuery({
    queryKey: monthsQueryKey(userId),
    queryFn: fetchMonths,
    ...POLL,
  });
