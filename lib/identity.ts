/**
 * Web identity until the Telegram Login Widget lands. Server-only: DEV_TELEGRAM_USER_ID
 * is read here and nowhere near a client component. Both routes resolve identity the same
 * way, so there is one place to replace when real auth arrives.
 */
export type IdentityResult =
  { ok: true; userId: number } | { ok: false; error: string };

export const resolveDevUserId = (): IdentityResult => {
  const raw = process.env.DEV_TELEGRAM_USER_ID;

  if (!raw) {
    return {
      ok: false,
      error:
        "DEV_TELEGRAM_USER_ID is not set, so the web chat has no identity.",
    };
  }

  const userId = Number(raw);

  if (!Number.isSafeInteger(userId)) {
    return { ok: false, error: "DEV_TELEGRAM_USER_ID must be an integer." };
  }

  return { ok: true, userId };
};
