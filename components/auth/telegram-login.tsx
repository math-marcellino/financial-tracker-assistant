"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Telegram injects its own iframe button; we can't style it, only place it.
 *
 * It renders only on a public HTTPS domain registered to the bot via BotFather
 * `/setdomain` — on localhost it silently shows nothing, which is why the dev identity
 * fallback exists.
 */

type AuthPayload = Record<string, string | number>;

declare global {
  interface Window {
    onTelegramAuth?: (user: AuthPayload) => void;
  }
}

export const TelegramLogin = ({ botUsername }: { botUsername: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.onTelegramAuth = async (user) => {
      setError(null);

      const response = await fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(user),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        setError(body?.error ?? "Sign-in failed.");
        return;
      }

      // A full reload is right here: the session cookie changes what the server renders.
      window.location.reload();
    };

    const script = document.createElement("script");

    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-request-access", "write");

    containerRef.current?.appendChild(script);

    return () => {
      delete window.onTelegramAuth;
    };
  }, [botUsername]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div ref={containerRef} />
      {error ? <p className="text-sm text-[var(--co-error)]">{error}</p> : null}
    </div>
  );
};
