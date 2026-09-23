import { getGroq } from "@/lib/agent/llm";

/**
 * Which models the switcher may offer, resolved from Groq's live list rather than
 * hardcoded — the catalogue changes without notice.
 */

export type AvailableModel = {
  id: string;
  contextWindow: number;
  ownedBy: string;
};

/** Audio, moderation and guard models can't drive a chat loop. */
const NON_CHAT = [
  "whisper",
  "tts",
  "guard",
  "orpheus",
  "safeguard",
];

/**
 * The tool declarations alone are ~1,000 tokens before the system instruction, the
 * replayed history and any tool results. A small window can't hold a turn, so models
 * below this are excluded rather than offered and left to fail mid-conversation.
 */
const MIN_CONTEXT_WINDOW = 16_000;

/**
 * Groq returns `context_window`, but the SDK's Model type doesn't declare it. Read it
 * by narrowing rather than casting, so a future SDK change surfaces as a 0 here instead
 * of a runtime surprise.
 */
const contextWindowOf = (model: unknown): number => {
  if (typeof model !== "object" || model === null) {
    return 0;
  }

  const value = (model as Record<string, unknown>).context_window;

  return typeof value === "number" ? value : 0;
};

export const listAvailableModels = async (): Promise<AvailableModel[]> => {
  const response = await getGroq().models.list();

  return (response.data ?? [])
    .filter((model) => {
      const id = model.id ?? "";

      return (
        id.length > 0 &&
        !NON_CHAT.some((fragment) => id.includes(fragment)) &&
        contextWindowOf(model) >= MIN_CONTEXT_WINDOW
      );
    })
    .map((model) => ({
      id: model.id,
      contextWindow: contextWindowOf(model),
      ownedBy: model.owned_by ?? "",
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
};

/**
 * Models that accept image content.
 *
 * Groq's model list does not advertise this, and the only honest way to discover it is
 * to try: the gpt-oss models reject an image part outright with "content must be a
 * string", while qwen accepts it. Hard-coding the prefix is a known-stale-able choice,
 * so an unknown model is assumed text-only rather than assumed capable.
 */
const VISION_MODEL_PREFIXES = ["qwen/"];

export const supportsVision = (modelId: string): boolean =>
  VISION_MODEL_PREFIXES.some((prefix) => modelId.startsWith(prefix));

/**
 * The model to use when the turn includes an image.
 *
 * A text-only model does not degrade on image input — it fails the whole request — so
 * the user's preference is overridden rather than honoured into an error. The caller
 * is told, so the switch is visible instead of silent.
 */
export const resolveVisionModel = async (
  preferred: string,
): Promise<string | null> => {
  if (supportsVision(preferred)) {
    return preferred;
  }

  const available = await listAvailableModels();

  return available.find((model) => supportsVision(model.id))?.id ?? null;
};

/**
 * A model id from a client is untrusted input, same as a tool-call argument. Returns
 * the fallback when the id isn't one Groq currently offers.
 */
export const resolveModel = async (
  requested: string | null | undefined,
  fallback: string,
): Promise<string> => {
  if (!requested) {
    return fallback;
  }

  const available = await listAvailableModels();

  return available.some((model) => model.id === requested) ? requested : fallback;
};
