import { Bot, webhookCallback } from "grammy";

import { handleAgentMessage } from "@/lib/agent/handleAgentMessage";
import { ensureUser } from "@/lib/db/users";
import { verifyWebhookSecret } from "@/lib/telegram/verify";

/**
 * The Telegram surface. A thin wrapper, exactly like the web chat route: it resolves
 * identity and delegates to the same agent core. No parsing or categorization here — if
 * a fix ever needs applying in this file, it belongs in lib/agent instead.
 */

export const dynamic = "force-dynamic";

let cached: { bot: Bot; handle: (request: Request) => Promise<Response> } | null =
  null;

const getHandler = () => {
  if (cached) {
    return cached;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set.");
  }

  const bot = new Bot(token);

  bot.on("message:text", async (ctx) => {
    const from = ctx.from;

    if (!from) {
      return;
    }

    await ensureUser(from.id, {
      username: from.username ?? null,
      firstName: from.first_name ?? null,
    });

    const result = await handleAgentMessage({
      userId: from.id,
      message: ctx.message.text,
      source: "telegram",
    });

    await ctx.reply(result.ok ? result.reply : result.error);
  });

  cached = { bot, handle: webhookCallback(bot, "std/http") };

  return cached;
};

export const POST = async (request: Request): Promise<Response> => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!secret) {
    return new Response("Webhook secret is not configured.", { status: 500 });
  }

  // Checked before the body is read: an unverified webhook endpoint is a public write
  // API, and the body is attacker-controlled until this passes.
  if (
    !verifyWebhookSecret(
      request.headers.get("x-telegram-bot-api-secret-token"),
      secret,
    )
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    return await getHandler().handle(request);
  } catch (error) {
    // Telegram redelivers on a non-2xx, and a redelivery loop would re-run the agent on
    // every retry. Log it and acknowledge.
    console.error("telegram-webhook failed", error);

    return new Response("ok", { status: 200 });
  }
};
