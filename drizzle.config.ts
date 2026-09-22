import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Next.js loads .env.local automatically at runtime; the drizzle-kit CLI does not.
config({ path: ".env.local" });

// Migrations run DDL, which PgBouncer's transaction mode doesn't fully support, so prefer
// the direct connection here. DATABASE_URL stays pooled for the app at runtime.
const databaseUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;

// `generate` and `check` work purely from the schema file. Only the commands that open a
// connection need the URL, so schema work isn't blocked on having a database to hand.
const needsConnection = !process.argv.includes("generate") && !process.argv.includes("check");

if (needsConnection && !databaseUrl) {
  throw new Error(
    "Neither DATABASE_URL_UNPOOLED nor DATABASE_URL is set. Add them to .env.local before running drizzle-kit.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  // Only ever empty for the offline commands guarded above.
  dbCredentials: { url: databaseUrl ?? "" },
  strict: true,
  verbose: true,
});
