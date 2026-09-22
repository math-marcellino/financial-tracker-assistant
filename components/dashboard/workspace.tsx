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
    <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-6 pb-6">
      <div
        role="tablist"
        aria-label="Workspace"
        className="mb-4 flex shrink-0 gap-2 lg:hidden"
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

      <div className="flex min-h-0 flex-1 flex-col gap-8 lg:flex-row lg:gap-10">
        <div
          className={`min-h-0 flex-1 overflow-x-hidden overflow-y-auto lg:block lg:basis-[58%] ${
            pane === "dashboard" ? "block" : "hidden"
          }`}
        >
          <DashboardPanel userId={userId} />
        </div>

        <div
          className={`min-h-0 flex-1 flex-col lg:flex lg:basis-[42%] lg:border-l lg:border-[var(--co-hairline)] lg:pl-10 ${
            pane === "chat" ? "flex" : "hidden"
          }`}
        >
          <ChatBox userId={userId} />
        </div>
      </div>
    </div>
  );
};
