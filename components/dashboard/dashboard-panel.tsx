"use client";

import { useState } from "react";

import { BudgetProgressList } from "@/components/dashboard/budget-progress";
import {
  IncomeVsExpenseChart,
  SpendByCategoryChart,
} from "@/components/dashboard/charts";
import { MonthSelector } from "@/components/dashboard/month-selector";
import { TransactionsTable } from "@/components/dashboard/transactions-table";
import { TextShimmer } from "@/components/ui/text-shimmer";
import {
  useBudgets,
  useMonths,
  useTransactions,
} from "@/hooks/use-transactions";

const Section = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <section className="flex flex-col gap-3">
    <h2 className="font-mono text-[0.75rem] tracking-[0.28px] text-[var(--co-slate)] uppercase">
      {title}
    </h2>
    {children}
  </section>
);

export const DashboardPanel = ({ userId }: { userId: number }) => {
  // null = all time. Months come from the data, so the list is never speculative.
  const [month, setMonth] = useState<string | null>(null);

  const transactions = useTransactions(userId, month);
  const budgets = useBudgets(userId, month);
  const months = useMonths(userId);

  // Surfaced, not swallowed: a failing poll shouldn't look like an empty dashboard.
  const error = transactions.error ?? budgets.error;

  if (error) {
    return (
      <div className="rounded-[var(--radius-sm)] border border-[var(--co-hairline)] px-4 py-3">
        <p className="text-base text-[var(--co-error)]">{error.message}</p>
      </div>
    );
  }

  if (transactions.isPending) {
    return (
      <div className="py-6">
        <TextShimmer className="text-base">Loading your records…</TextShimmer>
      </div>
    );
  }

  const rows = transactions.data ?? [];

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-mono text-[0.75rem] tracking-[0.28px] text-[var(--co-slate)] uppercase">
          {month ? "Selected month" : "All time"}
        </h2>
        <MonthSelector
          months={months.data ?? []}
          value={month}
          onChange={setMonth}
        />
      </div>

      <Section title="Spend by category">
        <SpendByCategoryChart transactions={rows} />
      </Section>

      <Section title="Income vs expense">
        <IncomeVsExpenseChart transactions={rows} />
      </Section>

      <Section title="Budgets">
        <BudgetProgressList budgets={budgets.data ?? []} />
      </Section>

      <Section title="Transactions">
        <TransactionsTable userId={userId} transactions={rows} />
      </Section>
    </div>
  );
};
