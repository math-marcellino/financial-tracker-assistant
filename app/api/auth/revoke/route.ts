import { resolveUserId } from "@/lib/identity";
import { revokeAllSessions } from "@/lib/session";

/**
 * Signs the account out on every device at once.
 *
 * This exists because revoking the app inside Telegram cannot reach us: the Login
 * Widget is a one-shot identity assertion with no revocation channel, so the only
 * place a session can be killed is here.
 */
export const POST = async (): Promise<Response> => {
  const identity = await resolveUserId();

  if (!identity.ok) {
    return Response.json({ ok: false, error: identity.error }, { status: 401 });
  }

  await revokeAllSessions(identity.userId);

  return Response.json({ ok: true });
};
