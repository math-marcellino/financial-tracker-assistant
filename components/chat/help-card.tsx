"use client";

import { X } from "lucide-react";

import { CAPABILITIES } from "@/lib/agent/capabilities";

/**
 * The answer to `/help`, rendered locally: no LLM call, nothing stored. It's the same
 * list Telegram's /help sends, so the two surfaces can't describe different agents.
 *
 * Same flat, rule-separated treatment as the transaction card. Examples are buttons
 * that fill the composer, since trying one is faster than retyping it.
 */
export const HelpCard = ({
  onPick,
  onClose,
}: {
  onPick: (example: string) => void;
  onClose: () => void;
}) => (
  <div className="w-full max-w-md rounded-[var(--radius-sm)] border border-[var(--co-hairline)] bg-[var(--co-canvas)] px-6 py-2">
    <div className="flex items-center justify-between border-b border-[var(--co-card-border)] py-3">
      <p className="font-mono text-[0.75rem] tracking-[0.28px] text-[var(--co-slate)] uppercase">
        What I can do
      </p>
      <button
        type="button"
        aria-label="Close help"
        onClick={onClose}
        className="rounded-full p-1 text-[var(--co-muted)] transition-colors hover:text-[var(--co-ink)]"
      >
        <X size={14} />
      </button>
    </div>

    <ul>
      {Object.values(CAPABILITIES).map((capability) => (
        <li
          key={capability.title}
          className="flex flex-col gap-1 border-b border-[var(--co-card-border)] py-3 last:border-b-0"
        >
          <span className="text-base text-[var(--co-ink)]">
            {capability.title}
          </span>
          <span className="text-[0.875rem] text-[var(--co-body-muted)]">
            {capability.description}
          </span>
          <button
            type="button"
            onClick={() => onPick(capability.example)}
            className="self-start text-left text-[0.875rem] text-[var(--co-action-blue)] hover:underline"
          >
            &ldquo;{capability.example}&rdquo;
          </button>
        </li>
      ))}
    </ul>

    <p className="border-t border-[var(--co-card-border)] py-3 text-[0.8125rem] text-[var(--co-muted)]">
      Type <span className="font-mono text-[var(--co-ink)]">/help</span> any
      time to see this again.
    </p>
  </div>
);
