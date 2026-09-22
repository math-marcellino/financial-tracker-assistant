import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";

import { ChatBox } from "@/components/chat/chat-box";
import { listMessagesAscending } from "@/lib/db/messages";
import { ensureUser } from "@/lib/db/users";
import { messagesQueryKey } from "@/lib/api/messages";
import { TelegramLogin } from "@/components/auth/telegram-login";
import { resolveUserId } from "@/lib/identity";

// Server Component. The "use client" boundary sits on ChatBox, not on this page.
export default async function DashboardPage() {
  const identity = await resolveUserId();

  if (!identity.ok) {
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
              Sign in with Telegram to use the same account from the web and the bot.
            </p>
          </div>

          {botUsername ? (
            <TelegramLogin botUsername={botUsername} />
          ) : (
            <p className="text-sm text-white/70">
              NEXT_PUBLIC_TELEGRAM_BOT_USERNAME is not set, so the login widget cannot
              render.
            </p>
          )}
        </div>
      </main>
    );
  }

  await ensureUser(identity.userId);

  // Prefetch on the server, hydrate on the client: the thread is there on first paint
  // with no extra round-trip, and stays reactive afterwards.
  const queryClient = new QueryClient();

  await queryClient.prefetchQuery({
    queryKey: messagesQueryKey(identity.userId),
    queryFn: () => listMessagesAscending(identity.userId),
  });

  return (
    /* The scroller must be the full width of the window, so its scrollbar sits at
       the very right edge rather than at the edge of the reading column. The column
       width is applied to the content inside it instead. */
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <header className="mx-auto flex w-full max-w-2xl shrink-0 flex-col gap-2 px-6 pt-10 pb-6">
        {/* section-heading: 48px / 400 / -0.48px. Never bold — size and spacing do the
            hierarchy work (DESIGN.md § Typography Principles). */}
        <h1 className="text-[2.5rem] leading-[1.1] font-normal tracking-[-0.48px] text-[var(--co-ink)]">
          Money, in plain language
        </h1>
        <p className="text-[1.125rem] leading-[1.4] text-[var(--co-body-muted)]">
          Tell it what you spent. Ask it what you&rsquo;ve spent.
        </p>
      </header>

      <HydrationBoundary state={dehydrate(queryClient)}>
        <ChatBox userId={identity.userId} />
      </HydrationBoundary>
    </div>
  );
}
