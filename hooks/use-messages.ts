"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { fetchMessages, messagesQueryKey } from "@/lib/api/messages";
import type { MessageWithTransaction } from "@/lib/db/messages";

export const useMessages = (
  userId: number,
): UseQueryResult<MessageWithTransaction[], Error> =>
  useQuery({ queryKey: messagesQueryKey(userId), queryFn: fetchMessages });
