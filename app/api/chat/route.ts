import * as v from "valibot";

import { handleAgentMessage } from "@/lib/agent/handleAgentMessage";
import { ensureUser } from "@/lib/db/users";
import { resolveDevUserId } from "@/lib/identity";

// A Route Handler is a public HTTP endpoint, so the body is validated here the same way a
// tool call is. Keep this file thin: parsing and categorization belong in the agent core,
// which the Telegram webhook will wrap too.

const BodySchema = v.object({
  message: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, "Message is empty."),
    v.maxLength(2000),
  ),
});

export const POST = async (request: Request): Promise<Response> => {
  const identity = resolveDevUserId();

  if (!identity.ok) {
    return Response.json({ ok: false, error: identity.error }, { status: 500 });
  }

  const parsed = v.safeParse(BodySchema, await request.json());

  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: parsed.issues.map((issue) => issue.message).join("; "),
      },
      { status: 400 },
    );
  }

  await ensureUser(identity.userId);

  const result = await handleAgentMessage({
    userId: identity.userId,
    message: parsed.output.message,
    source: "web",
  });

  return Response.json(result, { status: result.ok ? 200 : 422 });
};
