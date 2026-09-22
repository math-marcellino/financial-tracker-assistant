import type {
  AgentEvent,
  AgentResult,
} from "@/lib/agent/handleAgentMessage";

/**
 * Reads the SSE stream from /api/chat and hands each event to `onEvent` as it lands.
 * Resolves once the stream closes, with the terminal outcome.
 */
export const sendChatMessage = async (
  message: string,
  onEvent: (event: AgentEvent) => void,
): Promise<AgentResult> => {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (!response.ok || !response.body) {
    // A non-stream response is the route rejecting before the loop started.
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    return {
      ok: false,
      error: body?.error ?? `Chat request failed with ${response.status}.`,
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let outcome: AgentResult = {
    ok: false,
    error: "The stream closed without a result.",
  };

  for (;;) {
    const { done, value } = await reader.read();

    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    // SSE frames are separated by a blank line; a partial frame stays in the buffer.
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      const line = frame.split("\n").find((part) => part.startsWith("data: "));

      if (!line) continue;

      const event = JSON.parse(line.slice(6)) as AgentEvent;

      onEvent(event);

      if (event.type === "done") {
        outcome = {
          ok: true,
          reply: event.reply,
          transaction: event.transaction,
        };
      }

      if (event.type === "error") {
        outcome = { ok: false, error: event.error };
      }
    }
  }

  return outcome;
};
