"use client";

import { MessageSquare, X } from "lucide-react";
import { useEffect, useState } from "react";

import { ChatBox } from "@/components/chat/chat-box";
import { DashboardPanel } from "@/components/dashboard/dashboard-panel";

/**
 * Two panes side by side on desktop, with the chat as a rail anchored to the right edge
 * of the screen.
 *
 * Below `lg` there isn't room for both. The dashboard is the default view — it's the
 * thing you scan — and the chat opens over it as a drawer from a floating button.
 */
export const Workspace = ({
  userId,
  accountMenu,
}: {
  userId: number;
  // Rendered by the Server Component so the signed-in name never round-trips.
  accountMenu?: React.ReactNode;
}) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Escape closes the drawer; a full-screen overlay with no keyboard exit is a trap.
  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);

    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col lg:flex-row">
      <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pt-8 pb-24 lg:pb-10">
          {/* The header lives inside the dashboard column so it tracks that column's
              centre, rather than being nudged into place with margins from outside. */}
          <header className="flex flex-col gap-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 className="text-[2.25rem] leading-[1.1] font-normal tracking-[-0.48px] text-[var(--co-ink)]">
                Money, in plain language
              </h1>
              {accountMenu ? (
                <div className="shrink-0 pt-2">{accountMenu}</div>
              ) : null}
            </div>
            <p className="text-[1.0625rem] leading-[1.4] text-[var(--co-body-muted)]">
              Tell it what you spent. Ask it what you&rsquo;ve spent.
            </p>
          </header>

          <DashboardPanel userId={userId} />
        </div>
      </main>

      {/* Scrim: mobile only, and only while the drawer is open. */}
      {drawerOpen ? (
        <button
          type="button"
          aria-label="Close assistant"
          onClick={() => setDrawerOpen(false)}
          className="fixed inset-0 z-30 bg-[var(--co-ink)]/25 lg:hidden"
        />
      ) : null}

      <aside
        // Below lg this is a bottom drawer; at lg and up it is the static right rail.
        // lg:flex-none keeps the drawer's mobile sizing from fighting the rail width.
        className={`flex min-h-0 flex-col border-[var(--co-hairline)] bg-[var(--co-canvas)] max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-40 max-lg:h-[85dvh] max-lg:rounded-t-[var(--radius-lg)] max-lg:border-t max-lg:px-5 max-lg:pb-4 max-lg:shadow-[0_-8px_32px_-12px_rgba(0,0,0,0.18)] max-lg:transition-transform max-lg:duration-200 lg:w-[26rem] lg:flex-none lg:border-l lg:px-8 lg:pt-8 lg:pb-6 xl:w-[30rem] ${
          drawerOpen ? "max-lg:translate-y-0" : "max-lg:translate-y-full"
        }`}
      >
        <div className="relative flex shrink-0 items-center justify-center pt-3 pb-1 lg:hidden">
          {/* A grab handle reads as "this panel slides", which a bare close button doesn't. */}
          <span
            aria-hidden="true"
            className="h-1 w-10 rounded-full bg-[var(--co-hairline)]"
          />
          <button
            type="button"
            aria-label="Close assistant"
            onClick={() => setDrawerOpen(false)}
            className="absolute right-0 rounded-full p-1.5 text-[var(--co-muted)] transition-colors hover:text-[var(--co-ink)]"
          >
            <X size={18} />
          </button>
        </div>

        <ChatBox userId={userId} />
      </aside>

      {!drawerOpen ? (
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="co-pill fixed right-5 bottom-5 z-20 flex items-center gap-2 px-5 py-3 text-[0.9375rem] shadow-[0_8px_24px_-8px_rgba(0,0,0,0.35)] lg:hidden"
        >
          <MessageSquare size={17} />
          Assistant
        </button>
      ) : null}
    </div>
  );
};
