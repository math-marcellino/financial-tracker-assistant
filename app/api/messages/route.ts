import { listMessagesAscending } from "@/lib/db/messages";
import { ensureUser } from "@/lib/db/users";
import { resolveDevUserId } from "@/lib/identity";

export const dynamic = "force-dynamic";

export const GET = async (): Promise<Response> => {
  const identity = resolveDevUserId();

  if (!identity.ok) {
    return Response.json({ ok: false, error: identity.error }, { status: 500 });
  }

  await ensureUser(identity.userId);

  return Response.json({
    messages: await listMessagesAscending(identity.userId),
  });
};
