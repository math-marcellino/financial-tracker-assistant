import { Bot, webhookCallback, type Context } from "grammy";

import { handleAgentMessage } from "@/lib/agent/handleAgentMessage";
import { appBaseUrl, createLoginToken } from "@/lib/auth/login-token";
import type { Transaction } from "@/lib/db/schema";
import { ensureUser, findUser } from "@/lib/db/users";
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

/**
 * Guards the paths that cost something. A Telegram id proves *who* somebody is, never
 * that they have an account here — and an account is what the LLM call is spent on.
 *
 * `/login` is deliberately exempt: it is the signup route, it costs one row, and it
 * never reaches the LLM. Everything else requires an existing account, so an unknown
 * sender gets a pointer and nothing runs beyond this one indexed read.
 */
const requireRegistered = async (
  ctx: Context,
): Promise<{ id: number } | null> => {
  const from = ctx.from;

  if (!from) {
    return null;
  }

  const user = await findUser(from.id);

  if (!user) {
    await ctx.reply(
      `You'll need an account before I can help.\n\nSend /login and I'll send you a sign-in link — or sign in with Telegram at ${appBaseUrl()}.`,
      { link_preview_options: { is_disabled: true } },
    );

    return null;
  }

  // Refresh the display name only for people we already know; Telegram usernames change.
  await ensureUser(from.id, {
    username: from.username ?? null,
    firstName: from.first_name ?? null,
  });

  return { id: from.id };
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
  /**
   * Deliberately open, unlike every other handler: this *is* the signup route.
   *
   * Gating it would mean the only way to register is the Login Widget, whose
   * phone-number step fails silently in some browsers — a user it fails for would have
   * no way in at all. This path costs one row and a token, and never reaches the LLM,
   * so opening it does not open the expensive surface.
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

  /**
   * A receipt photo. Telegram hosts the file, so it is fetched, read once and dropped —
   * nothing is stored on our side.
   */
  bot.on("message:photo", async (ctx) => {
    const sender = await requireRegistered(ctx);

    if (!sender) {
      return;
    }

    // `photo` is the same image at several sizes, smallest first. The largest is the
    // only one with a chance of legible receipt text.
    const largest = ctx.message.photo.at(-1);

    if (!largest) {
      return;
    }

    let dataUrl: string;

    try {
      const file = await ctx.api.getFile(largest.file_id);

      if (!file.file_path) {
        throw new Error("Telegram returned no file path.");
      }

      const response = await fetch(
        `https://api.telegram.org/file/bot${token}/${file.file_path}`,
      );

      if (!response.ok) {
        throw new Error(`Telegram file download failed (${response.status}).`);
      }

      const bytes = Buffer.from(await response.arrayBuffer());

      dataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;
    } catch (error) {
      // Surfaced: a silent failure here looks like the bot ignored the photo.
      console.error("could not fetch telegram photo", error);
      await ctx.reply("I could not download that photo. Try sending it again.");

      return;
    }

    const result = await handleAgentMessage({
      userId: sender.id,
      message:
        ctx.message.caption ??
        "Here is a receipt — log it as a single transaction.",
      image: { dataUrl },
      source: "telegram",
    });

    const body = result.ok ? result.reply : result.error;
    const html =
      toTelegramHtml(body) +
      (result.ok ? transactionCard(result.transaction) : "");

    try {
      await ctx.reply(html, { parse_mode: "HTML" });
    } catch (error) {
      console.error("telegram HTML reply rejected, sending plain text", error);
      await ctx.reply(body);
    }
  });

  bot.on("message:text", async (ctx) => {
    const sender = await requireRegistered(ctx);

    if (!sender) {
      return;
    }

    const result = await handleAgentMessage({
      userId: sender.id,
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
