import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "@/lib/db/schema";

type Database = ReturnType<typeof drizzle<typeof schema>>;

// Same reason as lib/agent/llm.ts: connect on first query, so a missing DATABASE_URL
// fails the request that needs it instead of the build.
let client: Database | undefined;

export const getDb = (): Database => {
  if (!client) {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error("DATABASE_URL is not set.");
    }

    client = drizzle(neon(databaseUrl), { schema });
  }

  return client;
};

export { schema };
