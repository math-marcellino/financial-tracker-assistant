"use client";

import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import type { AgentResult } from "@/lib/agent/handleAgentMessage";
import { sendChatMessage } from "@/lib/api/chat";

export const useSendMessage = (): UseMutationResult<AgentResult, Error, string> =>
  useMutation({ mutationFn: sendChatMessage });
