import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Server-side verification of Telegram's Login Widget payload.
 *
 * A Telegram user ID from the client is worthless on its own — the hash is the only
 * thing that makes it trustworthy, so nothing downstream may run before this passes.
 */

/** Telegram's own recommendation: treat anything older than a day as stale. */
const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

export type LoginWidgetPayload = Record<string, string | number | undefined> & {
  id: number | string;
  auth_date: number | string;
  hash: string;
};

const safeEqualHex = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    // Non-hex input: not equal, and not an exception the caller has to handle.
    return false;
  }
};

export const verifyLoginWidget = (
  payload: LoginWidgetPayload,
  botToken: string,
  now: Date = new Date(),
): boolean => {
  const { hash, ...fields } = payload;

  if (typeof hash !== "string" || hash.length === 0) {
    return false;
  }

  // Every field except `hash`, sorted by key, as `key=value` joined with newlines.
  const dataCheckString = Object.keys(fields)
    .filter((key) => fields[key] !== undefined)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join("\n");

  const secret = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  if (!safeEqualHex(hash, expected)) {
    return false;
  }

  // A valid hash never expires on its own, so without this check an intercepted
  // payload stays replayable forever.
  const authDate = Number(payload.auth_date);

  if (!Number.isFinite(authDate)) {
    return false;
  }

  const ageSeconds = Math.floor(now.getTime() / 1000) - authDate;

  return ageSeconds >= 0 && ageSeconds < MAX_AUTH_AGE_SECONDS;
};

/**
 * The `X-Telegram-Bot-Api-Secret-Token` header Telegram echoes on every webhook call.
 * An unverified webhook endpoint is a public write API.
 */
export const verifyWebhookSecret = (
  header: string | null,
  secret: string,
): boolean => {
  if (!header || header.length !== secret.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(header), Buffer.from(secret));
  } catch {
    return false;
  }
};
