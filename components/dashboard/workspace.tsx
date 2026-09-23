"use client";

import { useState } from "react";

import { ChatBox } from "@/components/chat/chat-box";
import { DashboardPanel } from "@/components/dashboard/dashboard-panel";

/**
 * Two panes side by side on desktop. Below `lg` there isn't room for both, and
 * stacking them starves the chat — so they become tabs and each gets the full height.
 */
type Pane = "dashboard" | "chat";

const TABS: Array<{ id: Pane; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "chat", label: "Chat" },
];

export const Workspace = ({ userId }: { userId: number }) => {
  const [pane, setPane] = useState<Pane>("chat");

  return (
    // On large screens the chat is a rail anchored to the right edge of the *screen*;
    // the dashboard takes the rest and centres its own content. Below lg there is no
    // room for both, so they become tabs and each gets the full height.
    <div className="flex min-h-0 w-full flex-1 flex-col lg:flex-row">
      <div className="w-full px-6 pt-6 lg:hidden">
        <div
          role="tablist"
          aria-label="Workspace"
          className="mb-4 flex shrink-0 gap-2"
        >
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={pane === tab.id}
              onClick={() => setPane(tab.id)}
              className={
                pane === tab.id
                  ? "co-pill px-4 py-1.5 text-[0.875rem]"
                  : "co-pill-outline px-4 py-1.5 text-[0.875rem]"
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <main
        className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto lg:block ${
          pane === "dashboard" ? "block" : "hidden"
        }`}
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 pt-8 pb-10">
          {/* The header lives inside the dashboard column so it tracks that column's
              centre, rather than being nudged into place with margins from outside. */}
          <header className="flex flex-col gap-2">
            <h1 className="text-[2.25rem] leading-[1.1] font-normal tracking-[-0.48px] text-[var(--co-ink)]">
              Money, in plain language
            </h1>
            <p className="text-[1.0625rem] leading-[1.4] text-[var(--co-body-muted)]">
              Tell it what you spent. Ask it what you&rsquo;ve spent.
            </p>
          </header>

          <DashboardPanel userId={userId} />
        </div>
      </main>

      <aside
        // lg:flex-none matters: the mobile branch adds flex-1 so the pane fills the
        // screen, and without this it would also override the rail's fixed width.
        className={`min-h-0 flex-col border-[var(--co-hairline)] px-6 pb-6 lg:flex lg:w-[26rem] lg:flex-none lg:border-l lg:px-8 lg:pt-8 xl:w-[30rem] ${
          pane === "chat" ? "flex flex-1" : "hidden"
        }`}
      >
        <ChatBox userId={userId} />
      </aside>
    </div>
  );
};
