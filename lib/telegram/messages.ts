import { CAPABILITIES } from "@/lib/agent/capabilities";
import { appBaseUrl } from "@/lib/auth/login-token";

/**
 * Canned bot messages, as Telegram HTML. Kept out of the webhook route so every place
 * the bot speaks unprompted (/start, /help, the sign-in notice) describes the agent
 * from the same capability list.
 */

export const escapeHtml = (text: string): string =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const capabilityList = (): string[] =>
  Object.values(CAPABILITIES).map(
    (capability) =>
      `<b>${escapeHtml(capability.title)}</b>\n${escapeHtml(capability.description)}\n<i>“${escapeHtml(capability.example)}”</i>`,
  );

/**
 * The same capability list the web chat's /help renders. An unknown sender is told how
 * to get an account first, since nothing else will work for them until they do.
 */
export const helpMessage = (registered: boolean, greeting: boolean): string =>
  [
    ...(greeting
      ? [
          "I keep track of your money from plain-language messages. Tell me what you spent or earned, and ask me about it later.",
        ]
      : []),
    ...(registered
      ? []
      : [
          `First, send /login to get a sign-in link. That creates your account, and you can use the dashboard at ${escapeHtml(appBaseUrl())} too.`,
        ]),
    "<b>What I can do</b>",
    ...capabilityList(),
    "Send /help any time to see this again.",
  ].join("\n\n");
