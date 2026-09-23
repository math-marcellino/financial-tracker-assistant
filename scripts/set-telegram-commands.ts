/**
 * Registers the bot's slash-command menu (the list Telegram shows when you type "/").
 *
 * A one-off call against the live bot, not something the webhook does per request:
 * the menu is bot-wide config that persists on Telegram's side until replaced. Re-run
 * it whenever BOT_COMMANDS changes.
 *
 *   pnpm telegram:commands
 */
import { config } from "dotenv";
import { Bot } from "grammy";

config({ path: ".env.local" });

import { BOT_COMMANDS } from "@/lib/agent/capabilities";

const main = async (): Promise<void> => {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set in .env.local.");
  }

  const bot = new Bot(token);

  await bot.api.setMyCommands([...BOT_COMMANDS]);

  const registered = await bot.api.getMyCommands();

  console.log(
    `Registered ${registered.length} commands: ${registered
      .map((command) => `/${command.command}`)
      .join(", ")}`,
  );
};

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
