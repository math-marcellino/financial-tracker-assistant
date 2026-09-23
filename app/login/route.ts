import { redirect } from "next/navigation";

import { consumeLoginToken } from "@/lib/auth/login-token";
import { createSessionCookie } from "@/lib/session";

/**
 * Redeems a one-time link from the bot's /login command.
 *
 * A Route Handler rather than a page: it sets a cookie and redirects, and never
 * renders anything of its own.
 */
export const dynamic = "force-dynamic";

export const GET = async (request: Request): Promise<Response> => {
  const token = new URL(request.url).searchParams.get("token");

  if (!token) {
    redirect("/?login=missing");
  }

  const userId = await consumeLoginToken(token);

  // Forged, expired and already-used all land here. The reason is deliberately not
  // distinguished in the response — it would only help someone probing links.
  if (userId === null) {
    redirect("/?login=invalid");
  }

  await createSessionCookie(userId);

  redirect("/");
};
