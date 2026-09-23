import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * The model preference is shared by both surfaces: picking one on the web changes which
 * model answers on Telegram too, because they are one account.
 */
export const setPreferredModel = async (
  userId: number,
  model: string | null,
): Promise<void> => {
  await getDb()
    .update(users)
    .set({ preferredModel: model })
    .where(eq(users.telegramId, userId));
};
