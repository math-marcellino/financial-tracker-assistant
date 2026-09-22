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
    <div className="flex flex-1 flex-col items-center bg-background">
      <main className="flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Financial tracker
          </h1>
          <p className="text-sm text-muted-foreground">
            Log income and expenses in plain language.
          </p>
        </header>

        <HydrationBoundary state={dehydrate(queryClient)}>
          <ChatBox userId={identity.userId} />
        </HydrationBoundary>
      </main>
    </div>
  );
}
