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

/** Roughly 6 MB of base64, i.e. ~4.5 MB of image. Larger is a phone photo nobody resized. */
const MAX_IMAGE_CHARS = 6_000_000;

const BodySchema = v.object({
  // With an image attached the text may be empty — the picture is the message.
  message: v.pipe(v.string(), v.trim(), v.maxLength(2000)),
  image: v.optional(
    v.pipe(
      v.string(),
      v.regex(
        /^data:image\/(png|jpe?g|webp|gif);base64,/,
        "Only PNG, JPEG, WebP or GIF images are accepted.",
      ),
      v.maxLength(MAX_IMAGE_CHARS, "That image is too large — under 4 MB, please."),
    ),
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

  // A malformed body throws here, not in safeParse — without the catch it escapes as a
  // bare 500 with no body, which is the one failure mode that looks like nothing happened.
  const body: unknown = await request.json().catch(() => null);
  const parsed = v.safeParse(BodySchema, body);

  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: parsed.issues.map((issue) => issue.message).join("; "),
      },
      { status: 400 },
    );
  }

  // One of the two has to carry intent; an empty message with no image is nothing.
  if (!parsed.output.message && !parsed.output.image) {
    return Response.json(
      { ok: false, error: "Message is empty." },
      { status: 400 },
    );
  }

  await ensureUser(identity.userId);

  const events = streamAgentMessage({
    userId: identity.userId,
    message:
      parsed.output.message ||
      "Here is a receipt — log it as a single transaction.",
    image: parsed.output.image
      ? { dataUrl: parsed.output.image }
      : undefined,
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
