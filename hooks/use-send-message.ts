"use client";

import { useMutation, type UseMutationResult } from "@tanstack/react-query";

import type {
  AgentEvent,
  AgentResult,
} from "@/lib/agent/handleAgentMessage";
import { sendChatMessage } from "@/lib/api/chat";

/** A turn is text, an image, or both — the picture can be the whole message. */
export type OutgoingMessage = { message: string; image?: string };

export const useSendMessage = (
  onEvent: (event: AgentEvent) => void,
): UseMutationResult<AgentResult, Error, OutgoingMessage> =>
  useMutation({
    mutationFn: ({ message, image }: OutgoingMessage) =>
      sendChatMessage(message, onEvent, image),
  });
