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

  const post = async (path: string, label: string) => {
    setPending(true);
    setError(null);

    const response = await fetch(path, { method: "POST" });

    if (!response.ok) {
      setError(`${label} failed (${response.status}).`);
      setPending(false);
      return;
    }

    // refresh(), not push(): the route is the same, but the Server Component has to
    // re-run against the now-cleared cookie so the login panel takes over.
    router.refresh();
  };

  const signOut = () => post("/api/auth/logout", "Sign out");

  /**
   * Revoking inside Telegram does not reach this app — the Login Widget gives no
   * revocation channel — so this is the only way to kill a session on a device you no
   * longer have.
   */
  const signOutEverywhere = () =>
    post("/api/auth/revoke", "Sign out everywhere");

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
      <button
        type="button"
        onClick={signOutEverywhere}
        disabled={pending}
        title="Invalidates this account's sessions on every device. Revoking access inside Telegram does not do this."
        className="text-[0.8125rem] text-[var(--co-body-muted)] underline-offset-4 transition-colors hover:text-[var(--co-ink)] hover:underline disabled:opacity-50"
      >
        everywhere
      </button>
      {error ? (
        <span className="text-[0.75rem] text-[var(--co-error)]">{error}</span>
      ) : null}
    </div>
  );
};
