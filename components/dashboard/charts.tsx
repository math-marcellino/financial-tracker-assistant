"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { DashboardTransaction } from "@/lib/db/transactions";
import { formatAmount, formatCompact, humanizeCategory } from "@/lib/format";

/**
 * Charts are the one place DESIGN.md sanctions gradient richness — "colour fields are
 * media-led". The UI chrome around them stays flat.
 *
 * Every figure here is derived from real rows; nothing is seeded or smoothed.
 */

const GRADIENTS = [
  ["var(--co-deep-green)", "var(--co-dark-navy)"],
  ["var(--co-action-blue)", "var(--co-deep-green)"],
  ["var(--co-coral)", "var(--co-coral-soft)"],
  ["var(--co-dark-navy)", "var(--co-action-blue)"],
  ["var(--co-slate)", "var(--co-muted)"],
] as const;

const axisStyle = {
  fontSize: 12,
  fill: "var(--co-muted)",
} as const;

const tooltipStyle = {
  background: "var(--co-canvas)",
  border: "1px solid var(--co-hairline)",
  borderRadius: 8,
  fontSize: 14,
  color: "var(--co-ink)",
} as const;

const primaryCurrency = (rows: DashboardTransaction[]): string =>
  rows[0]?.currency ?? "IDR";

export const SpendByCategoryChart = ({
  transactions,
}: {
  transactions: DashboardTransaction[];
}) => {
  const currency = primaryCurrency(transactions);

  const data = useMemo(() => {
    const totals = new Map<string, number>();

    for (const row of transactions) {
      if (row.type !== "expense") continue;

      const key = humanizeCategory(row.categoryExpense);

      totals.set(key, (totals.get(key) ?? 0) + Number(row.amount));
    }

    return [...totals.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }, [transactions]);

  if (data.length === 0) {
    return (
      <p className="py-6 text-base text-[var(--co-body-muted)]">
        No expenses yet.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <defs>
          {GRADIENTS.map(([from, to], index) => (
            <linearGradient
              key={index}
              id={`bar-gradient-${index}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={from} stopOpacity={0.95} />
              <stop offset="100%" stopColor={to} stopOpacity={0.75} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid
          vertical={false}
          stroke="var(--co-card-border)"
          strokeDasharray="0"
        />
        <XAxis
          dataKey="category"
          tick={axisStyle}
          tickLine={false}
          axisLine={{ stroke: "var(--co-hairline)" }}
          interval={0}
          angle={-20}
          textAnchor="end"
          height={56}
        />
        <YAxis
          tick={axisStyle}
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={(value: number) => formatCompact(value, currency)}
        />
        <Tooltip
          cursor={{ fill: "var(--co-card-border)" }}
          contentStyle={tooltipStyle}
          formatter={(value) => formatAmount(String(value), currency)}
        />
        {/* Per-bar fills go on Cell, not on nested Bars. */}
        <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={56}>
          {data.map((entry, index) => (
            <Cell
              key={entry.category}
              fill={`url(#bar-gradient-${index % GRADIENTS.length})`}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

export const IncomeVsExpenseChart = ({
  transactions,
}: {
  transactions: DashboardTransaction[];
}) => {
  const currency = primaryCurrency(transactions);

  const data = useMemo(() => {
    const byDay = new Map<string, { income: number; expense: number }>();

    for (const row of transactions) {
      const bucket = byDay.get(row.date) ?? { income: 0, expense: 0 };

      bucket[row.type] += Number(row.amount);
      byDay.set(row.date, bucket);
    }

    return [...byDay.entries()]
      .map(([date, totals]) => ({ date, ...totals }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [transactions]);

  if (data.length === 0) {
    return (
      <p className="py-6 text-base text-[var(--co-body-muted)]">
        Nothing to plot yet.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
        <CartesianGrid
          vertical={false}
          stroke="var(--co-card-border)"
          strokeDasharray="0"
        />
        <XAxis
          dataKey="date"
          tick={axisStyle}
          tickLine={false}
          axisLine={{ stroke: "var(--co-hairline)" }}
          minTickGap={24}
        />
        <YAxis
          tick={axisStyle}
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={(value: number) => formatCompact(value, currency)}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value, name) => [
            formatAmount(String(value), currency),
            name === "income" ? "Income" : "Expense",
          ]}
        />
        <Line
          type="monotone"
          dataKey="income"
          stroke="var(--co-deep-green)"
          strokeWidth={2}
          dot={{ r: 3, strokeWidth: 0, fill: "var(--co-deep-green)" }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="expense"
          stroke="var(--co-coral)"
          strokeWidth={2}
          dot={{ r: 3, strokeWidth: 0, fill: "var(--co-coral)" }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
};
