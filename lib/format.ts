/**
 * Display only. Stored values stay the exact strings Postgres returned; nothing here
 * feeds back into a write.
 *
 * Whole amounts drop their minor units. Intl still renders IDR with two decimals, and
 * "Rp 250,000.00" is noise for a currency nobody quotes in cents.
 */
export const formatAmount = (amount: string, currency: string): string => {
  const value = Number(amount);

  if (!Number.isFinite(value)) {
    return `${amount} ${currency}`;
  }

  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    ...(Number.isInteger(value) && {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }),
  }).format(value);
};

/** Compact axis/tick labels — full precision would blow out a chart axis in IDR. */
export const formatCompact = (value: number, currency: string): string =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

export const humanizeCategory = (category: string | null): string =>
  category ? category.replace(/_/g, " ") : "uncategorized";
