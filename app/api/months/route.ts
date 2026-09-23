import { listTransactionMonths } from "@/lib/db/transactions";
import { resolveUserId } from "@/lib/identity";

export const dynamic = "force-dynamic";

export const GET = async (): Promise<Response> => {
  const identity = await resolveUserId();

  if (!identity.ok) {
    return Response.json({ ok: false, error: identity.error }, { status: 401 });
  }

  return Response.json({ months: await listTransactionMonths(identity.userId) });
};
