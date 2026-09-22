import type { AgentResult } from "@/lib/agent/handleAgentMessage";

export const sendChatMessage = async (message: string): Promise<AgentResult> => {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  const body: unknown = await response.json();

  // The route returns an AgentResult shape on both success and the 422 validation path,
  // so anything else is a real transport or server failure and should surface as one.
  if (!response.ok && response.status !== 422) {
    throw new Error(`Chat request failed with ${response.status}.`);
  }

  return body as AgentResult;
};
