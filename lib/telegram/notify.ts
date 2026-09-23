import { Api } from "grammy";

import { hasAnyTransactions } from "@/lib/db/transactions";
import { loginNotice } from "@/lib/telegram/messages";

/**
 * Tells the user in Telegram that a web sign-in happened. Both sign-in paths guarantee
 * the bot may write to them: /login links are only issued in reply to a message, and the
 * Login Widget requests write access.
 *
 * Called from `after()`, once the session is already set. A failed send (the user has
 * blocked the bot, Telegram is down) must not undo a valid login, so it is logged
 * rather than thrown — logged, not swallowed.
 */
export const sendLoginNotice = async (userId: number): Promise<void> => {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.error("login notice not sent: TELEGRAM_BOT_TOKEN is not set");
    return;
  }

  try {
    const isNew = !(await hasAnyTransactions(userId));

    await new Api(token).sendMessage(userId, loginNotice(isNew), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  } catch (error) {
    console.error("login notice not sent", error);
  }
};
