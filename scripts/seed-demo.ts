/**
 * Seeds three months of sample transactions, plus a budget per month.
 *
 * By default it writes to a dedicated demo telegram_id, never to a real user's rows —
 * invented figures mixed into someone's actual spending records are indistinguishable
 * afterwards, and this is a finance tracker. `--user` exists for seeding your own
 * account on a dev database, and only ever into an account that has no records yet.
 *
 *   pnpm seed:demo                 insert (idempotent — clears the demo user first)
 *   pnpm seed:demo --clean         remove the demo user and everything it owns
 *   pnpm seed:demo --user <id>     insert into an existing, empty account
 */
import { config } from "dotenv";
import { count, eq } from "drizzle-orm";

config({ path: ".env.local" });

// Static imports are safe here because getDb() reads DATABASE_URL lazily, at call
// time — so dotenv above has already run by the time any query is issued. A
// top-level `await import()` would make this module async, which tsx can't transform.
import { getDb } from "@/lib/db";
import {
  budgets,
  transactionCategoryExpense,
  transactionCategoryIncome,
  transactions,
  users,
} from "@/lib/db/schema";

/** Outside the range Telegram issues, so it can never collide with a real account. */
const DEMO_USER_ID = 999_000_001;
const CURRENCY = "IDR";
const DAYS = 92;

type ExpenseCategory = (typeof transactionCategoryExpense.enumValues)[number];
type IncomeCategory = (typeof transactionCategoryIncome.enumValues)[number];

type Seed =
  | { date: string; amount: number; type: "expense"; category: ExpenseCategory; note: string }
  | { date: string; amount: number; type: "income"; category: IncomeCategory; note: string };

/**
 * Deterministic PRNG (mulberry32), so every run produces the same history and a
 * screenshot taken today matches one taken next week, relative to the date.
 */
const createRandom = (seed: number): (() => number) => {
  let state = seed;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Local calendar date, not UTC — a transaction logged at 06:00 WIB is still today. */
const toIsoDate = (date: Date): string => {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
};

const monthStart = (isoDate: string): string => `${isoDate.slice(0, 7)}-01`;

/**
 * Three months that look lived-in rather than uniform: fixed monthly bills on their
 * usual days, weekday lunches and commutes, weekly groceries, weekend outings, and
 * the occasional one-off. Flat, evenly spaced sample data makes the charts look
 * synthetic, which defeats the point.
 */
const buildHistory = (): Seed[] => {
  const random = createRandom(20260923);
  // A price in a range, rounded to the nearest 1,000 like real receipts in IDR.
  const price = (min: number, max: number): number =>
    Math.round((min + random() * (max - min)) / 1_000) * 1_000;
  const chance = (probability: number): boolean => random() < probability;

  const rows: Seed[] = [];
  const today = new Date();

  for (let offset = -(DAYS - 1); offset <= 0; offset++) {
    const day = new Date(today);
    day.setDate(today.getDate() + offset);

    const date = toIsoDate(day);
    const dayOfMonth = day.getDate();
    const dayOfWeek = day.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const expense = (amount: number, category: ExpenseCategory, note: string): void => {
      rows.push({ date, amount, type: "expense", category, note });
    };
    const income = (amount: number, category: IncomeCategory, note: string): void => {
      rows.push({ date, amount, type: "income", category, note });
    };

    // Monthly fixtures.
    if (dayOfMonth === 25) income(8_500_000, "salary", "monthly salary");
    if (dayOfMonth === 1) expense(1_850_000, "housing", "rent");
    if (dayOfMonth === 5) expense(price(380_000, 520_000), "utilities", "electricity token");
    if (dayOfMonth === 7) expense(350_000, "utilities", "home internet");
    if (dayOfMonth === 10) expense(149_000, "subscriptions", "streaming");
    if (dayOfMonth === 18) expense(59_000, "subscriptions", "music");
    if (dayOfMonth === 12) expense(100_000, "utilities", "phone credit");

    if (isWeekend) {
      if (chance(0.55)) {
        expense(price(80_000, 260_000), "food_drink", chance(0.5) ? "dinner out" : "brunch");
      }
      if (chance(0.3)) {
        expense(price(90_000, 320_000), "entertainment", chance(0.5) ? "cinema and snacks" : "karaoke");
      }
      if (chance(0.25)) {
        expense(price(150_000, 650_000), "shopping", chance(0.5) ? "clothes" : "home stuff");
      }
      if (chance(0.4)) expense(price(35_000, 95_000), "transport", "grab");
    } else {
      if (chance(0.85)) expense(price(35_000, 70_000), "food_drink", "lunch");
      if (chance(0.7)) expense(price(18_000, 38_000), "transport", "ojek");
      if (chance(0.35)) expense(price(25_000, 55_000), "food_drink", "coffee");
      if (chance(0.15)) expense(price(60_000, 140_000), "food_drink", "dinner");
    }

    // The big weekly shop, with the odd top-up midweek.
    if (dayOfWeek === 6) expense(price(320_000, 520_000), "groceries", "weekly groceries");
    if (dayOfWeek === 3 && chance(0.4)) {
      expense(price(80_000, 220_000), "groceries", "top-up groceries");
    }

    if (dayOfWeek === 0 && chance(0.6)) expense(200_000, "transport", "fuel");
  }

  // One-offs placed by offset, so they land at the same point in each run.
  const dateAt = (offset: number): string => {
    const day = new Date(today);
    day.setDate(today.getDate() + offset);

    return toIsoDate(day);
  };

  rows.push(
    { date: dateAt(-83), amount: 1_500_000, type: "income", category: "freelance", note: "logo design invoice" },
    { date: dateAt(-71), amount: 310_000, type: "expense", category: "health", note: "pharmacy" },
    { date: dateAt(-64), amount: 2_450_000, type: "expense", category: "travel", note: "flight to Bali" },
    { date: dateAt(-62), amount: 1_100_000, type: "expense", category: "travel", note: "hotel, 2 nights" },
    { date: dateAt(-55), amount: 500_000, type: "expense", category: "gifts_donations", note: "wedding gift" },
    { date: dateAt(-47), amount: 1_200_000, type: "income", category: "freelance", note: "side project invoice" },
    { date: dateAt(-40), amount: 750_000, type: "expense", category: "education", note: "online course" },
    { date: dateAt(-33), amount: 420_000, type: "expense", category: "shopping", note: "shoes" },
    { date: dateAt(-30), amount: 420_000, type: "income", category: "refund", note: "shoes returned" },
    { date: dateAt(-26), amount: 2_000_000, type: "income", category: "bonus", note: "quarterly bonus" },
    { date: dateAt(-19), amount: 450_000, type: "expense", category: "health", note: "dentist" },
    { date: dateAt(-12), amount: 6_500, type: "expense", category: "fees_charges", note: "transfer fee" },
    { date: dateAt(-6), amount: 1_800_000, type: "income", category: "freelance", note: "landing page invoice" },
    { date: dateAt(-3), amount: 1_250_000, type: "expense", category: "shopping", note: "headphones" },
  );

  return rows.sort((a, b) => a.date.localeCompare(b.date));
};

const BUDGETS: Array<{ category: ExpenseCategory; limit: number }> = [
  // Sized above a full month of seeded spend (~2.2M each), so these stay under budget
  // whichever day the script runs. The over-budget state still shows on a cold
  // dashboard via transport and shopping below.
  { category: "food_drink", limit: 3_000_000 },
  { category: "groceries", limit: 2_500_000 },
  { category: "transport", limit: 800_000 },
  { category: "shopping", limit: 1_000_000 },
];

const parseTargetUser = (): number | null => {
  const flagIndex = process.argv.indexOf("--user");

  if (flagIndex === -1) return null;

  const raw = process.argv[flagIndex + 1];
  const id = Number(raw);

  if (!raw || !Number.isSafeInteger(id) || id <= 0) {
    throw new Error(`--user needs a numeric Telegram user ID, got "${raw ?? ""}".`);
  }

  return id;
};

const cleanDemo = async (): Promise<void> => {
  // Transactions, budgets and messages all cascade from the user row.
  await getDb().delete(users).where(eq(users.telegramId, DEMO_USER_ID));
};

/**
 * A real account is never created or deleted here, and is only seeded while empty —
 * otherwise invented rows would sit beside real ones with nothing to tell them apart.
 */
const assertEmptyAccount = async (userId: number): Promise<void> => {
  const [user] = await getDb()
    .select({ id: users.telegramId })
    .from(users)
    .where(eq(users.telegramId, userId));

  if (!user) {
    throw new Error(`User ${userId} does not exist. Sign in once so the account is created.`);
  }

  const [{ value: transactionCount }] = await getDb()
    .select({ value: count() })
    .from(transactions)
    .where(eq(transactions.userId, userId));
  const [{ value: budgetCount }] = await getDb()
    .select({ value: count() })
    .from(budgets)
    .where(eq(budgets.userId, userId));

  if (transactionCount > 0 || budgetCount > 0) {
    throw new Error(
      `User ${userId} already has ${transactionCount} transactions and ${budgetCount} budgets. ` +
        "Refusing to mix sample data into real records.",
    );
  }
};

const seed = async (userId: number, history: Seed[]): Promise<void> => {
  const months = [...new Set(history.map((row) => monthStart(row.date)))];

  // One batch, so a failure part-way leaves no half-seeded account behind.
  await getDb().batch([
    getDb()
      .insert(transactions)
      .values(
        history.map((row) => ({
          userId,
          amount: row.amount.toFixed(2),
          currency: CURRENCY,
          type: row.type,
          categoryExpense: row.type === "expense" ? row.category : null,
          categoryIncome: row.type === "income" ? row.category : null,
          date: row.date,
          note: row.note,
        })),
      ),
    getDb()
      .insert(budgets)
      .values(
        months.flatMap((month) =>
          BUDGETS.map((budget) => ({
            userId,
            category: budget.category,
            limitAmount: budget.limit.toFixed(2),
            currency: CURRENCY,
            month,
          })),
        ),
      ),
  ]);
};

const main = async (): Promise<void> => {
  const targetUser = parseTargetUser();

  if (process.argv.includes("--clean")) {
    if (targetUser !== null) {
      throw new Error("--clean only removes the demo user; it never deletes a real account.");
    }

    await cleanDemo();
    console.log(`Removed demo user ${DEMO_USER_ID} and everything it owned.`);

    return;
  }

  const history = buildHistory();
  const userId = targetUser ?? DEMO_USER_ID;

  if (targetUser === null) {
    // Re-running should not double the data, so the demo user is rebuilt each time.
    await cleanDemo();
    await getDb().insert(users).values({
      telegramId: DEMO_USER_ID,
      username: "demo_account",
      firstName: "Demo",
      defaultCurrency: CURRENCY,
    });
  } else {
    await assertEmptyAccount(targetUser);
  }

  await seed(userId, history);

  const expenses = history.filter((row) => row.type === "expense");
  const income = history.filter((row) => row.type === "income");
  const sum = (rows: Seed[]) => rows.reduce((total, row) => total + row.amount, 0);
  const months = new Set(history.map((row) => monthStart(row.date))).size;

  console.log(`Seeded user ${userId}`);
  console.log(`  ${history.length} transactions across ${history[0].date} … ${history.at(-1)?.date}`);
  console.log(`  expenses: ${expenses.length} rows, ${sum(expenses).toLocaleString()} ${CURRENCY}`);
  console.log(`  income:   ${income.length} rows, ${sum(income).toLocaleString()} ${CURRENCY}`);
  console.log(`  budgets:  ${BUDGETS.length} categories × ${months} months`);

  if (targetUser === null) {
    console.log();
    console.log(`To view it: set DEV_TELEGRAM_USER_ID=${DEMO_USER_ID} in .env.local.`);
    console.log(`To remove it: pnpm seed:demo --clean`);
  }
};

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    // A seed that half-fails should say so loudly, not exit 0 with partial data.
    console.error("Seed failed:", error);
    process.exit(1);
  });
