import * as v from "valibot";

import { LLM_MODEL } from "@/lib/agent/llm";
import { listAvailableModels, resolveModel } from "@/lib/agent/models";
import { getDb } from "@/lib/db";
import { setPreferredModel } from "@/lib/db/preferences";
import { users } from "@/lib/db/schema";
import { resolveUserId } from "@/lib/identity";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export const GET = async (): Promise<Response> => {
  const identity = await resolveUserId();

  if (!identity.ok) {
    return Response.json({ ok: false, error: identity.error }, { status: 401 });
  }

  const [user] = await getDb()
    .select({ preferredModel: users.preferredModel })
    .from(users)
    .where(eq(users.telegramId, identity.userId));

  const models = await listAvailableModels();

  return Response.json({
    models,
    selected: await resolveModel(user?.preferredModel, LLM_MODEL),
    default: LLM_MODEL,
  });
};

const BodySchema = v.object({
  // null clears the preference and falls back to the app default.
  model: v.nullable(v.pipe(v.string(), v.minLength(1), v.maxLength(200))),
});

export const POST = async (request: Request): Promise<Response> => {
  const identity = await resolveUserId();

  if (!identity.ok) {
    return Response.json({ ok: false, error: identity.error }, { status: 401 });
  }

  const parsed = v.safeParse(BodySchema, await request.json().catch(() => null));

  if (!parsed.success) {
    return Response.json(
      { ok: false, error: "Invalid model selection." },
      { status: 400 },
    );
  }

  // A model id from a browser is untrusted input. Only ids Groq currently offers are
  // stored — an unknown one is rejected rather than quietly swapped for the default,
  // so a broken switcher is visible instead of silent.
  if (parsed.output.model !== null) {
    const available = await listAvailableModels();

    if (!available.some((model) => model.id === parsed.output.model)) {
      return Response.json(
        { ok: false, error: `Groq does not offer ${parsed.output.model}.` },
        { status: 400 },
      );
    }
  }

  await setPreferredModel(identity.userId, parsed.output.model);

  return Response.json({ ok: true, selected: parsed.output.model ?? LLM_MODEL });
};
