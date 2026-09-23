import { eq, sql } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

/**
 * A signed, HttpOnly session cookie. The payload is readable but not forgeable: the
 * signature is an HMAC over it with SESSION_SECRET, so a tampered user id fails.
 */

const COOKIE_NAME = "ft_session";
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * `epoch` is what makes a session revocable. Telegram's Login Widget is a one-shot
 * identity assertion — there is no endpoint to ask whether a user has since revoked
 * the app — so a cookie that only proves "Telegram vouched for this id once" would
 * stay valid until it expired. Bumping users.session_epoch invalidates every cookie
 * for that account on the next request.
 */
type SessionPayload = { uid: number; iat: number; epoch: number };

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

export const createSessionCookie = async (userId: number): Promise<void> => {
  const [user] = await getDb()
    .select({ epoch: users.sessionEpoch })
    .from(users)
    .where(eq(users.telegramId, userId));

  const payload: SessionPayload = {
    uid: userId,
    iat: Math.floor(Date.now() / 1000),
    epoch: user?.epoch ?? 0,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");

  (await cookies()).set(COOKIE_NAME, `${encoded}.${sign(encoded)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
};

export const clearSessionCookie = async (): Promise<void> => {
  (await cookies()).delete(COOKIE_NAME);
};

/** Returns the signed-in user id, or null. Never throws on a malformed cookie. */
export const readSession = async (): Promise<number | null> => {
  const raw = (await cookies()).get(COOKIE_NAME)?.value;

  if (!raw) {
    return null;
  }

  const [encoded, signature] = raw.split(".");

  if (!encoded || !signature || !safeEqual(signature, sign(encoded))) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString(),
    ) as SessionPayload;

    if (!Number.isSafeInteger(payload.uid)) {
      return null;
    }

    // The cookie's own max-age is a client-side hint; the age is re-checked here so an
    // expired cookie that was kept around is still rejected.
    if (Math.floor(Date.now() / 1000) - payload.iat > MAX_AGE_SECONDS) {
      return null;
    }

    // The signature proves the cookie is ours, not that it is still wanted. A stale
    // epoch means the account has signed out everywhere since this cookie was issued.
    const [user] = await getDb()
      .select({ epoch: users.sessionEpoch })
      .from(users)
      .where(eq(users.telegramId, payload.uid));

    if (!user || user.epoch !== (payload.epoch ?? 0)) {
      return null;
    }

    return payload.uid;
  } catch {
    return null;
  }
};

/**
 * Invalidates every session cookie for this account, on every device, immediately.
 * The user's own cookie is cleared too, so the caller does not need to.
 */
export const revokeAllSessions = async (userId: number): Promise<void> => {
  await getDb()
    .update(users)
    .set({ sessionEpoch: sql`${users.sessionEpoch} + 1` })
    .where(eq(users.telegramId, userId));

  await clearSessionCookie();
};
