import * as v from "valibot";

import { ensureUser } from "@/lib/db/users";
import { createSessionCookie } from "@/lib/session";
import { verifyLoginWidget } from "@/lib/telegram/verify";

/**
 * The Login Widget posts a signed payload here. Nothing downstream runs until the hash
 * verifies against the bot token — a Telegram user ID from a browser is untrusted input.
 */

const PayloadSchema = v.object({
  id: v.union([v.number(), v.string()]),
  auth_date: v.union([v.number(), v.string()]),
  hash: v.pipe(v.string(), v.minLength(1)),
  first_name: v.optional(v.string()),
  last_name: v.optional(v.string()),
  username: v.optional(v.string()),
  photo_url: v.optional(v.string()),
});

export const POST = async (request: Request): Promise<Response> => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return Response.json(
      { ok: false, error: "TELEGRAM_BOT_TOKEN is not set." },
      { status: 500 },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = v.safeParse(PayloadSchema, body);

  // One message for every failure path: saying which check failed tells an attacker
  // which half of the payload to keep working on.
  const reject = () =>
    Response.json(
      { ok: false, error: "Could not verify that Telegram login." },
      { status: 401 },
    );

  if (!parsed.success) {
    return reject();
  }

  if (!verifyLoginWidget(parsed.output, botToken)) {
    return reject();
  }

  const userId = Number(parsed.output.id);

  if (!Number.isSafeInteger(userId)) {
    return reject();
  }

  await ensureUser(userId, {
    username: parsed.output.username ?? null,
    firstName: parsed.output.first_name ?? null,
  });

  await createSessionCookie(userId);

  return Response.json({ ok: true });
};
