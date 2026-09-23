import Groq, { APIError, APIUserAbortError } from "groq-sdk";

// Built on first use, not at module load. `next build` imports route modules to collect
// page data, so a module-level throw would fail the whole build rather than the one
// request that actually needs the key.
let clients: { primary: Groq; fallback: Groq | null } | undefined;

const getClients = (): { primary: Groq; fallback: Groq | null } => {
  if (!clients) {
    const apiKey = process.env.GROQ_API_KEY;
    const fallbackKey = process.env.GROQ_API_KEY_FALLBACK;

    if (!apiKey) {
      throw new Error("GROQ_API_KEY is not set.");
    }

    clients = fallbackKey
      ? {
          // With a second key waiting, retrying the first one only delays the switch:
          // the SDK would back off on a 429 before the fallback ever got a turn.
          primary: new Groq({ apiKey, maxRetries: 0 }),
          fallback: new Groq({ apiKey: fallbackKey }),
        }
      : { primary: new Groq({ apiKey }), fallback: null };
  }

  return clients;
};

/**
 * Errors caused by the request itself fail identically on any key, so they are not
 * retried. Everything else — rate limits, a revoked key, an outage, a dropped
 * connection — is specific to the account or the moment, which a second key can fix.
 */
const REQUEST_FAULT_STATUSES = new Set([400, 404, 422]);

const shouldFallBack = (error: unknown): boolean =>
  error instanceof APIError &&
  !(error instanceof APIUserAbortError) &&
  !(error.status !== undefined && REQUEST_FAULT_STATUSES.has(error.status));

/**
 * Runs a Groq call on the primary key, then once more on `GROQ_API_KEY_FALLBACK` if the
 * primary failed for a key-specific reason. The switch is logged rather than silent,
 * and when both keys fail the fallback's error is what surfaces.
 *
 * For a streaming call this covers opening the stream, which is where a 429 or 401
 * arrives. A failure mid-stream is not retried: tokens have already reached the user.
 */
export const withGroq = async <T>(call: (client: Groq) => Promise<T>): Promise<T> => {
  const { primary, fallback } = getClients();

  try {
    return await call(primary);
  } catch (error) {
    if (!fallback || !shouldFallBack(error)) {
      throw error;
    }

    console.warn(
      `Primary Groq key failed (${error instanceof APIError ? error.status ?? "connection" : "unknown"}); retrying on GROQ_API_KEY_FALLBACK.`,
    );

    return call(fallback);
  }
};

// The largest tool-use-capable model this account can reach. Smaller models are
// noticeably worse at picking a category and expanding shorthand amounts.
export const LLM_MODEL = "openai/gpt-oss-120b";
