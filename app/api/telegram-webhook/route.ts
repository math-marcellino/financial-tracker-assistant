import { Bot, webhookCallback } from "grammy";

import { handleAgentMessage } from "@/lib/agent/handleAgentMessage";
import { appBaseUrl, createLoginToken } from "@/lib/auth/login-token";
import type { Transaction } from "@/lib/db/schema";
import { ensureUser } from "@/lib/db/users";
import { formatAmount, humanizeCategory } from "@/lib/format";
import { verifyWebhookSecret } from "@/lib/telegram/verify";

/**
 * The Telegram surface. A thin wrapper, exactly like the web chat route: it resolves
 * identity and delegates to the same agent core. No parsing or categorization here — if
 * a fix ever needs applying in this file, it belongs in lib/agent instead.
 */

export const dynamic = "force-dynamic";

/**
 * Replies are stored with markdown because the web chat renders it. Telegram does not:
 * `ctx.reply` sends plain text, so the asterisks show literally.
 *
 * HTML rather than Telegram's Markdown: its markdown uses single asterisks (so our
 * `**bold**` is wrong for it anyway) and needs a dozen characters escaped, any one of
 * which fails the whole send with a 400. HTML needs exactly three.
 */
/**
 * The web chat renders a card under a reply that wrote a transaction. Telegram got only
 * the sentence, so the same turn looked different on each surface.
 *
 * A blockquote is the closest Telegram equivalent to the bordered card — `<pre>` renders
 * as a code block with a copy button, which is heavier than this deserves. The values go
 * through the same formatters the web card uses, so the two cannot drift apart.
 */
const transactionCard = (transaction: Transaction | null): string => {
  if (!transaction) {
    return "";
  }

  const isExpense = transaction.type === "expense";
  const category = transaction.categoryExpense ?? transaction.categoryIncome;

  const rows = [
    `Amount: ${isExpense ? "−" : "+"}${formatAmount(transaction.amount, transaction.currency)}`,
    `Category: ${humanizeCategory(category)}`,
    `Date: ${transaction.date}`,
    ...(transaction.note ? [`Note: ${transaction.note}`] : []),
  ];

  // Escaped here, because this is appended after toTelegramHtml has already run on the
  // model's text — a note containing "<" must still not become markup.
  const escaped = rows.map((row) =>
    row.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
  );

  return `\n\n<blockquote><b>${isExpense ? "EXPENSE" : "INCOME"}</b>\n${escaped.join("\n")}</blockquote>`;
};

const toTelegramHtml = (text: string): string =>
  text
    // Escaping first, so a literal "<" in a note can't become markup.
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    // [\s\S] rather than the `s` flag: tsconfig targets ES2017, which predates it.
    .replace(/\*\*([\s\S]+?)\*\*/g, "<b>$1</b>")
    .replace(/__([\s\S]+?)__/g, "<b>$1</b>");

let cached: {
  bot: Bot;
  handle: (request: Request) => Promise<Response>;
} | null = null;

const getHandler = () => {
  if (cached) {
    return cached;
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set.");
  }

  const bot = new Bot(token);

  /**
   * Sign-in without the Login Widget.
   *
   * Telegram has already proven who sent this message, so a one-time link into this
   * chat is as trustworthy as the widget's hash — and it has no phone-number step,
   * no popup and no third-party cookie to be blocked.
   */
  bot.command("login", async (ctx) => {
    const from = ctx.from;

    if (!from) {
      return;
    }

    await ensureUser(from.id, {
      username: from.username ?? null,
      firstName: from.first_name ?? null,
    });

    const token = await createLoginToken(from.id);

    await ctx.reply(
      `Tap to sign in:\n${appBaseUrl()}/login?token=${token}\n\nThe link works once and expires in 10 minutes.`,
      { link_preview_options: { is_disabled: true } },
    );
  });

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

    const body = result.ok ? result.reply : result.error;

    // Order matters: the model's text is escaped and converted first, and the card's
    // own tags are appended after — running the escaper over the card would turn its
    // <blockquote> into visible &lt;blockquote&gt;.
    const html =
      toTelegramHtml(body) +
      (result.ok ? transactionCard(result.transaction) : "");

    try {
      await ctx.reply(html, { parse_mode: "HTML" });
    } catch (error) {
      // Malformed markup fails the send outright, which is worse than ugly asterisks.
      // The plain send still delivers the answer; the formatting bug is logged, not hidden.
      console.error("telegram HTML reply rejected, sending plain text", error);

      await ctx.reply(body);
    }
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
