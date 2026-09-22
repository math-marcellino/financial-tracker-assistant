import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";

import { ChatBox } from "@/components/chat/chat-box";
import { listMessagesAscending } from "@/lib/db/messages";
import { ensureUser } from "@/lib/db/users";
import { messagesQueryKey } from "@/lib/api/messages";
import { resolveDevUserId } from "@/lib/identity";

// Server Component. The "use client" boundary sits on ChatBox, not on this page.
export default async function DashboardPage() {
  const identity = resolveDevUserId();

  if (!identity.ok) {
    return (
      <main className="flex flex-1 items-center justify-center px-6">
        <p className="max-w-md text-sm text-destructive">{identity.error}</p>
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
