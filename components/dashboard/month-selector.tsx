"use client";

import { ChevronDown } from "lucide-react";

/**
 * Only months that actually have rows are offered — an empty option would look like
 * a bug. A native select rather than a pill row: the list grows by one every month
 * and a row of pills stops fitting.
 */
const label = (month: string): string => {
  const [year, index] = month.split("-");
  const date = new Date(Number(year), Number(index) - 1, 1);

  return date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

export const MonthSelector = ({
  months,
  value,
  onChange,
}: {
  months: string[];
  value: string | null;
  onChange: (month: string | null) => void;
}) => (
  <div className="relative inline-flex items-center">
    <label htmlFor="month-filter" className="sr-only">
      Filter by month
    </label>
    <select
      id="month-filter"
      value={value ?? "all"}
      onChange={(event) =>
        onChange(event.target.value === "all" ? null : event.target.value)
      }
      className="co-pill-outline appearance-none py-1.5 pr-9 pl-4 text-[0.875rem] focus-visible:border-[var(--co-form-focus)]"
    >
      <option value="all">All time</option>
      {months.map((month) => (
        <option key={month} value={month}>
          {label(month)}
        </option>
      ))}
    </select>
    <ChevronDown
      size={14}
      aria-hidden="true"
      className="pointer-events-none absolute right-3.5 text-[var(--co-muted)]"
    />
  </div>
);
