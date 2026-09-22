import type { MessageWithTransaction } from "@/lib/db/messages";

export const messagesQueryKey = (userId: number) =>
  ["messages", userId] as const;

export const fetchMessages = async (): Promise<MessageWithTransaction[]> => {
  const response = await fetch("/api/messages");

  if (!response.ok) {
    throw new Error(`Failed to load messages (${response.status}).`);
  }

  const body = (await response.json()) as {
    messages: MessageWithTransaction[];
  };

  return body.messages;
};
