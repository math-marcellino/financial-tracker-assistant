import { readSession } from "@/lib/session";

/**
 * Who the current request belongs to. One place to change when auth evolves.
 *
 * The dev fallback exists because the Telegram Login Widget only renders on a public
 * HTTPS domain the bot owns — it can never work on localhost. It is refused outright in
 * production so it cannot become an auth bypass.
 */
export type IdentityResult =
  /**
   * `via` matters to the UI: on the dev fallback there is no cookie to clear, so a
   * sign-out button would appear to do nothing. The caller needs to know which it is.
   */
  | { ok: true; userId: number; via: "session" | "dev" }
  | { ok: false; error: string };

export const resolveUserId = async (): Promise<IdentityResult> => {
  const sessionUserId = await readSession();

  if (sessionUserId !== null) {
    return { ok: true, userId: sessionUserId, via: "session" };
  }

  if (process.env.NODE_ENV === "production") {
    return { ok: false, error: "Not signed in." };
  }

  const raw = process.env.DEV_TELEGRAM_USER_ID;

  if (!raw) {
    return {
      ok: false,
      error: "Not signed in, and DEV_TELEGRAM_USER_ID is not set.",
    };
  }

  const userId = Number(raw);

  if (!Number.isSafeInteger(userId)) {
    return { ok: false, error: "DEV_TELEGRAM_USER_ID must be an integer." };
  }

  return { ok: true, userId, via: "dev" };
};
