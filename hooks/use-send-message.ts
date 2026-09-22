"use client";

import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import type {
  AgentEvent,
  AgentResult,
} from "@/lib/agent/handleAgentMessage";
import { sendChatMessage } from "@/lib/api/chat";

export const useSendMessage = (
  onEvent: (event: AgentEvent) => void,
): UseMutationResult<AgentResult, Error, string> =>
  useMutation({
    mutationFn: (message: string) => sendChatMessage(message, onEvent),
  });
