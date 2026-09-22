"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { fetchMessages, messagesQueryKey } from "@/lib/api/messages";
import type { Message } from "@/lib/db/schema";

export const useMessages = (userId: number): UseQueryResult<Message[], Error> =>
  useQuery({ queryKey: messagesQueryKey(userId), queryFn: fetchMessages });
