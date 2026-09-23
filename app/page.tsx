import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";

import { AccountMenu } from "@/components/auth/account-menu";
import { TelegramLogin } from "@/components/auth/telegram-login";
import { Workspace } from "@/components/dashboard/workspace";
import { messagesQueryKey } from "@/lib/api/messages";
import { budgetsQueryKey, transactionsQueryKey } from "@/lib/api/transactions";
import { listMessagesAscending } from "@/lib/db/messages";
import { listBudgetsWithSpend, listRecentForUser } from "@/lib/db/transactions";
import { ensureUser } from "@/lib/db/users";
import { resolveUserId } from "@/lib/identity";

// Server Component. The "use client" boundary sits on ChatBox, not on this page.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const identity = await resolveUserId();

  if (!identity.ok) {
    // /login redirects here with a reason. Landing on a bare sign-in page after
    // clicking a dead link looks like the click did nothing.
    const { login } = await searchParams;
    const loginError =
      login === "invalid"
        ? "That sign-in link has expired or was already used. Send /login again for a fresh one."
        : login === "missing"
          ? "That sign-in link was incomplete. Send /login again for a fresh one."
          : null;

    const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

    return (
      <main className="flex flex-1 items-center justify-center px-6 py-10">
        {/* The one large colour field on the page — a media panel, which is where
            DESIGN.md allows gradient richness. */}
        <div className="co-media-gradient flex w-full max-w-md flex-col items-center gap-6 rounded-[var(--radius-lg)] px-8 py-12 text-center">
          <div className="flex flex-col gap-2">
            <h1 className="text-[2rem] leading-[1.1] font-normal tracking-[-0.32px] text-[var(--co-on-dark)]">
              Money, in plain language
            </h1>
            <p className="text-base leading-[1.5] text-white/70">
              Sign in with Telegram to use the same account from the web and the
              bot.
            </p>
          </div>

          {loginError ? (
            <p className="rounded-[var(--radius-sm)] border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white/90">
              {loginError}
            </p>
          ) : null}

          {botUsername ? (
            <div className="flex flex-col items-center gap-4">
              <TelegramLogin botUsername={botUsername} />

              {/* The widget's phone-number step fails silently in some browsers, so the
                  bot route is offered as a peer rather than buried as a fallback. */}
              <p className="text-sm text-white/60">
                Or send{" "}
                <a
                  href={`https://t.me/${botUsername}?start=login`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-white/80 underline underline-offset-4"
                >
                  /login
                </a>{" "}
                to the bot and tap the link it sends back.
              </p>
            </div>
          ) : (
            <p className="text-sm text-white/70">
              NEXT_PUBLIC_TELEGRAM_BOT_USERNAME is not set, so the login widget
              cannot render.
            </p>
          )}
        </div>
      </main>
    );
  }

  const user = await ensureUser(identity.userId);
  // Telegram usernames are optional, so fall back through first name to the id.
  const displayName = user.username
    ? `@${user.username}`
    : (user.firstName ?? String(user.telegramId));

  // Prefetch on the server, hydrate on the client: the thread is there on first paint
  // with no extra round-trip, and stays reactive afterwards.
  const queryClient = new QueryClient();

  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: messagesQueryKey(identity.userId),
      queryFn: () => listMessagesAscending(identity.userId),
    }),
    queryClient.prefetchQuery({
      queryKey: transactionsQueryKey(identity.userId),
      queryFn: () => listRecentForUser(identity.userId),
    }),
    queryClient.prefetchQuery({
      queryKey: budgetsQueryKey(identity.userId),
      queryFn: () => listBudgetsWithSpend(identity.userId),
    }),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <HydrationBoundary state={dehydrate(queryClient)}>
        <Workspace
          userId={identity.userId}
          accountMenu={<AccountMenu name={displayName} via={identity.via} />}
        />
      </HydrationBoundary>
    </div>
  );
}
