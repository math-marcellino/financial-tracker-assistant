import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";

/**
 * Transactions carry a foreign key to `users`, so a row has to exist before the agent can
 * write anything. Identity is a caller concern: route handlers decide *who* the user is,
 * this just guarantees the row.
 */
export const ensureUser = async (telegramId: number): Promise<User> => {
  const [inserted] = await getDb()
    .insert(users)
    .values({ telegramId })
    .onConflictDoNothing()
    .returning();

  if (inserted) {
    return inserted;
  }

  const [existing] = await getDb().select().from(users).where(eq(users.telegramId, telegramId));

  if (!existing) {
    throw new Error(`Failed to load user ${telegramId} after upsert.`);
  }

  return existing;
};
