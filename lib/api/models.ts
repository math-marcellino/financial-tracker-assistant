import type { AvailableModel } from "@/lib/agent/models";

export const modelsQueryKey = (userId: number) => ["models", userId] as const;

export type ModelsResponse = {
  models: AvailableModel[];
  selected: string;
  default: string;
};

export const fetchModels = async (): Promise<ModelsResponse> => {
  const response = await fetch("/api/models");

  if (!response.ok) {
    throw new Error(`Failed to load models (${response.status}).`);
  }

  return (await response.json()) as ModelsResponse;
};

export const saveModel = async (model: string): Promise<void> => {
  const response = await fetch("/api/models", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    throw new Error(body?.error ?? `Could not switch model (${response.status}).`);
  }
};
