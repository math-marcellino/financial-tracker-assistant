import type { Message } from "@/lib/db/schema";

export const messagesQueryKey = (userId: number) =>
  ["messages", userId] as const;

export const fetchMessages = async (): Promise<Message[]> => {
  const response = await fetch("/api/messages");

  if (!response.ok) {
    throw new Error(`Failed to load messages (${response.status}).`);
  }

  const body = (await response.json()) as { messages: Message[] };

  return body.messages;
};
