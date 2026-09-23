import { and, eq, gt, lt } from "drizzle-orm";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { getDb } from "@/lib/db";
import { loginTokens } from "@/lib/db/schema";

/**
 * One-time login links, issued by the bot and redeemed in the browser.
 *
 * This exists because the Telegram Login Widget depends on a phone-number handshake
 * that can fail in ways neither we nor the user can see. The bot already proves
 * identity — Telegram tells us who sent a message — so a link sent into that chat is
 * as trustworthy as the widget, and has no browser-side moving parts.
 */

/** Long enough to switch devices, short enough that a stale link in chat is useless. */
const TTL_SECONDS = 10 * 60;

type TokenPayload = { uid: number; jti: string; exp: number };

const getSecret = (): string => {
  const secret = process.env.SESSION_SECRET;

  if (!secret) {
    throw new Error("SESSION_SECRET is not set.");
  }

  return secret;
};

const sign = (encoded: string): string =>
  createHmac("sha256", getSecret()).update(encoded).digest("base64url");

const safeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
};

export const createLoginToken = async (userId: number): Promise<string> => {
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000);

  await getDb().insert(loginTokens).values({ id: jti, userId, expiresAt });

  // Opportunistic cleanup: expired rows are dead weight and nothing else prunes them.
  await getDb().delete(loginTokens).where(lt(loginTokens.expiresAt, new Date()));

  const payload: TokenPayload = {
    uid: userId,
    jti,
    exp: Math.floor(expiresAt.getTime() / 1000),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");

  return `${encoded}.${sign(encoded)}`;
};

/**
 * Verifies and burns the token in one step. Returns the user id, or null for anything
 * that is forged, expired, or already used — the caller cannot tell which, on purpose.
 */
export const consumeLoginToken = async (
  token: string,
): Promise<number | null> => {
  const [encoded, signature] = token.split(".");

  if (!encoded || !signature || !safeEqual(signature, sign(encoded))) {
    return null;
  }

  let payload: TokenPayload;

  try {
    payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString(),
    ) as TokenPayload;
  } catch {
    return null;
  }

  if (!Number.isSafeInteger(payload.uid) || typeof payload.jti !== "string") {
    return null;
  }

  // DELETE ... RETURNING is the single-use check: two concurrent redemptions race on
  // the same row and exactly one of them gets it back.
  const [row] = await getDb()
    .delete(loginTokens)
    .where(
      and(
        eq(loginTokens.id, payload.jti),
        eq(loginTokens.userId, payload.uid),
        gt(loginTokens.expiresAt, new Date()),
      ),
    )
    .returning();

  return row ? payload.uid : null;
};

/** Where the bot should point the link. */
export const appBaseUrl = (): string => {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, "");
  }

  // Set automatically on Vercel, so no extra configuration is needed there.
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  return "http://localhost:3000";
};
