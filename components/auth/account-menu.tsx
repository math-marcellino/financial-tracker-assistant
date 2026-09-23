"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Who you're signed in as, and how to stop being them.
 *
 * On the dev fallback there is no session cookie, so signing out cannot do anything —
 * `resolveUserId` would immediately fall back to DEV_TELEGRAM_USER_ID again. Saying so
 * is better than a button that silently no-ops.
 */
export const AccountMenu = ({
  name,
  via,
}: {
  name: string;
  via: "session" | "dev";
}) => {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signOut = async () => {
    setPending(true);
    setError(null);

    const response = await fetch("/api/auth/logout", { method: "POST" });

    if (!response.ok) {
      setError(`Sign out failed (${response.status}).`);
      setPending(false);
      return;
    }

    // refresh(), not push(): the route is the same, but the Server Component has to
    // re-run against the now-cleared cookie so the login panel takes over.
    router.refresh();
  };

  if (via === "dev") {
    return (
      <span
        className="font-mono text-[0.6875rem] tracking-[0.28px] text-[var(--co-muted)] uppercase"
        title="Signed in via DEV_TELEGRAM_USER_ID — there is no session cookie to clear."
      >
        Dev session · {name}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[0.6875rem] tracking-[0.28px] text-[var(--co-muted)] uppercase">
        {name}
      </span>
      <button
        type="button"
        onClick={signOut}
        disabled={pending}
        className="co-pill-outline flex items-center gap-1.5 px-3 py-1 text-[0.8125rem] disabled:opacity-50"
      >
        <LogOut size={13} />
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error ? (
        <span className="text-[0.75rem] text-[var(--co-error)]">{error}</span>
      ) : null}
    </div>
  );
};
