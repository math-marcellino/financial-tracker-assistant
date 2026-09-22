import { clearSessionCookie } from "@/lib/session";

export const POST = async (): Promise<Response> => {
  await clearSessionCookie();

  return Response.json({ ok: true });
};
