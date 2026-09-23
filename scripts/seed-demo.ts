/**
 * Seeds a week of sample transactions for a demo account.
 *
 * Writes to a dedicated telegram_id, never to a real user's rows — invented figures
 * mixed into someone's actual spending records are indistinguishable afterwards, and
 * this is a finance tracker.
 *
 *   pnpm seed:demo          insert (idempotent — clears this demo user first)
 *   pnpm seed:demo --clean  remove the demo user and everything it owns
 */
import { config } from "dotenv";
import { eq } from "drizzle-orm";

config({ path: ".env.local" });

// Static imports are safe here because getDb() reads DATABASE_URL lazily, at call
// time — so dotenv above has already run by the time any query is issued. A
// top-level `await import()` would make this module async, which tsx can't transform.
import { getDb } from "@/lib/db";
import { budgets, transactions, users } from "@/lib/db/schema";

/** Outside the range Telegram issues, so it can never collide with a real account. */
const DEMO_USER_ID = 999_000_001;
const CURRENCY = "IDR";

type Seed = {
  dayOffset: number;
  amount: number;
  type: "income" | "expense";
  category: string;
  note: string;
};

/**
 * A week that looks lived-in rather than uniform: a payday spike, weekday lunches,
 * one big grocery run, a weekend outing, and a couple of quiet days. Flat, evenly
 * spaced sample data makes the charts look synthetic, which defeats the point.
 */
const WEEK: Seed[] = [
  { dayOffset: -6, amount: 8_500_000, type: "income", category: "salary", note: "monthly salary" },
  { dayOffset: -6, amount: 1_850_000, type: "expense", category: "housing", note: "rent" },
  { dayOffset: -6, amount: 42_000, type: "expense", category: "food_drink", note: "lunch" },

  { dayOffset: -5, amount: 385_000, type: "expense", category: "groceries", note: "weekly groceries" },
  { dayOffset: -5, amount: 28_000, type: "expense", category: "transport", note: "ojek" },
  { dayOffset: -5, amount: 55_000, type: "expense", category: "food_drink", note: "lunch" },

  { dayOffset: -4, amount: 65_000, type: "expense", category: "food_drink", note: "lunch with team" },
  { dayOffset: -4, amount: 149_000, type: "expense", category: "subscriptions", note: "streaming" },

  { dayOffset: -3, amount: 32_000, type: "expense", category: "transport", note: "ojek" },
  { dayOffset: -3, amount: 48_000, type: "expense", category: "food_drink", note: "lunch" },
  { dayOffset: -3, amount: 310_000, type: "expense", category: "health", note: "pharmacy" },

  { dayOffset: -2, amount: 1_200_000, type: "income", category: "freelance", note: "side project invoice" },
  { dayOffset: -2, amount: 95_000, type: "expense", category: "food_drink", note: "dinner" },

  { dayOffset: -1, amount: 420_000, type: "expense", category: "shopping", note: "shoes" },
  { dayOffset: -1, amount: 180_000, type: "expense", category: "entertainment", note: "cinema and snacks" },
  { dayOffset: -1, amount: 75_000, type: "expense", category: "transport", note: "grab" },

  { dayOffset: 0, amount: 38_000, type: "expense", category: "food_drink", note: "coffee" },
  { dayOffset: 0, amount: 265_000, type: "expense", category: "groceries", note: "top-up groceries" },
];

const BUDGETS: Array<{ category: string; limit: number }> = [
  { category: "food_drink", limit: 1_500_000 },
  // Deliberately under the seeded groceries spend, so the over-budget state is visible
  // on a cold dashboard rather than only after someone overspends.
  { category: "groceries", limit: 500_000 },
  { category: "transport", limit: 600_000 },
];

const isoDate = (offsetDays: number): string => {
  const date = new Date();

  date.setDate(date.getDate() + offsetDays);

  return date.toISOString().slice(0, 10);
};

const clean = async (): Promise<void> => {
  // Transactions, budgets and messages all cascade from the user row.
  await getDb().delete(users).where(eq(users.telegramId, DEMO_USER_ID));
};

const seed = async (): Promise<void> => {
  // Re-running should not double the data, so the demo user is rebuilt each time.
  await clean();

  await getDb().insert(users).values({
    telegramId: DEMO_USER_ID,
    username: "demo_account",
    firstName: "Demo",
    defaultCurrency: CURRENCY,
  });

  await getDb()
    .insert(transactions)
    .values(
      WEEK.map((row) => {
        const isExpense = row.type === "expense";

        return {
          userId: DEMO_USER_ID,
          amount: row.amount.toFixed(2),
          currency: CURRENCY,
          type: row.type,
          categoryExpense: isExpense
            ? (row.category as "food_drink")
            : null,
          categoryIncome: isExpense ? null : (row.category as "salary"),
          date: isoDate(row.dayOffset),
          note: row.note,
        };
      }),
    );

  const month = `${isoDate(0).slice(0, 7)}-01`;

  await getDb()
    .insert(budgets)
    .values(
      BUDGETS.map((budget) => ({
        userId: DEMO_USER_ID,
        category: budget.category as "food_drink",
        limitAmount: budget.limit.toFixed(2),
        currency: CURRENCY,
        month,
      })),
    );
};

const main = async (): Promise<void> => {
  if (process.argv.includes("--clean")) {
    await clean();
    console.log(`Removed demo user ${DEMO_USER_ID} and everything it owned.`);

    return;
  }

  await seed();

  const expenses = WEEK.filter((row) => row.type === "expense");
  const income = WEEK.filter((row) => row.type === "income");
  const sum = (rows: Seed[]) => rows.reduce((total, row) => total + row.amount, 0);

  console.log(`Seeded demo user ${DEMO_USER_ID} (@demo_account)`);
  console.log(`  ${WEEK.length} transactions across ${isoDate(-6)} … ${isoDate(0)}`);
  console.log(`  expenses: ${expenses.length} rows, ${sum(expenses).toLocaleString()} ${CURRENCY}`);
  console.log(`  income:   ${income.length} rows, ${sum(income).toLocaleString()} ${CURRENCY}`);
  console.log(`  budgets:  ${BUDGETS.length}`);
  console.log();
  console.log(`To view it: set DEV_TELEGRAM_USER_ID=${DEMO_USER_ID} in .env.local.`);
  console.log(`To remove it: pnpm seed:demo --clean`);
};

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    // A seed that half-fails should say so loudly, not exit 0 with partial data.
    console.error("Seed failed:", error);
    process.exit(1);
  });
