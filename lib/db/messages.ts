import { asc, desc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import {
  messages,
  transactions,
  type Message,
  type NewMessage,
  type Transaction,
} from "@/lib/db/schema";

export const DEFAULT_HISTORY_LIMIT = 20;

/**
 * The newest `limit` messages, returned oldest-first so they can be replayed straight
 * into a chat completion or rendered top-to-bottom.
 */
export const listMessages = async (
  userId: number,
  limit: number = DEFAULT_HISTORY_LIMIT,
): Promise<Message[]> => {
  const rows = await getDb()
    .select()
    .from(messages)
    .where(eq(messages.userId, userId))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit);

  return rows.reverse();
};

/** A stored turn plus the transaction it announced, so history renders its card again. */
export type MessageWithTransaction = Message & {
  transaction: Transaction | null;
};

/** Oldest-first, for rendering a whole thread rather than a replay window. */
export const listMessagesAscending = async (
  userId: number,
  limit: number = 200,
): Promise<MessageWithTransaction[]> => {
  const rows = await getDb()
    .select({ message: messages, transaction: transactions })
    .from(messages)
    .leftJoin(transactions, eq(messages.transactionId, transactions.id))
    .where(eq(messages.userId, userId))
    .orderBy(asc(messages.createdAt), asc(messages.id))
    .limit(limit);

  return rows.map((row) => ({ ...row.message, transaction: row.transaction }));
};

export const appendMessage = async (message: NewMessage): Promise<Message> => {
  const [row] = await getDb().insert(messages).values(message).returning();

  return row;
};
