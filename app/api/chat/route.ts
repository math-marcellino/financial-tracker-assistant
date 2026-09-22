import * as v from "valibot";

import {
  streamAgentMessage,
  type AgentEvent,
} from "@/lib/agent/handleAgentMessage";
import { ensureUser } from "@/lib/db/users";
import { resolveUserId } from "@/lib/identity";

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

const encoder = new TextEncoder();

const sse = (event: AgentEvent): Uint8Array =>
  encoder.encode(`data: ${JSON.stringify(event)}\n\n`);

export const POST = async (request: Request): Promise<Response> => {
  const identity = await resolveUserId();

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

  const events = streamAgentMessage({
    userId: identity.userId,
    message: parsed.output.message,
    source: "web",
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) {
          controller.enqueue(sse(event));
        }
      } catch (error) {
        // The connection is already open, so a failure has to travel as an event
        // rather than as a status code.
        controller.enqueue(
          sse({
            type: "error",
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform stops proxies buffering the stream into one blob.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
};
