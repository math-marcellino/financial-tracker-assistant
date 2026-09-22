import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";

/**
 * Transactions carry a foreign key to `users`, so a row has to exist before the agent can
 * write anything. Identity is a caller concern: route handlers decide *who* the user is,
 * this just guarantees the row.
 */
export const ensureUser = async (
  telegramId: number,
  profile?: { username?: string | null; firstName?: string | null },
): Promise<User> => {
  // Telegram usernames change, so refresh them when we're given them — but an empty
  // `set` is invalid SQL, so with no profile this stays a plain do-nothing upsert.
  const updates = {
    ...(profile?.username !== undefined && { username: profile.username }),
    ...(profile?.firstName !== undefined && { firstName: profile.firstName }),
  };

  const values = {
    telegramId,
    username: profile?.username ?? null,
    firstName: profile?.firstName ?? null,
  };

  const insert = getDb().insert(users).values(values);

  const [row] =
    Object.keys(updates).length > 0
      ? await insert
          .onConflictDoUpdate({ target: users.telegramId, set: updates })
          .returning()
      : await insert.onConflictDoNothing().returning();

  if (row) {
    return row;
  }

  const [existing] = await getDb()
    .select()
    .from(users)
    .where(eq(users.telegramId, telegramId));

  if (!existing) {
    throw new Error(`Failed to load user ${telegramId} after upsert.`);
  }

  return existing;
};
