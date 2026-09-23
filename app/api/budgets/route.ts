import { listBudgetsWithSpend } from "@/lib/db/transactions";
import { resolveUserId } from "@/lib/identity";

export const dynamic = "force-dynamic";

/** `month` is YYYY-MM, or absent for all time. Anything malformed is ignored. */
const readMonth = (request: Request): string | null => {
  const month = new URL(request.url).searchParams.get("month");

  return month && /^\d{4}-\d{2}$/.test(month) ? month : null;
};

export const GET = async (request: Request): Promise<Response> => {
  const identity = await resolveUserId();

  if (!identity.ok) {
    return Response.json({ ok: false, error: identity.error }, { status: 401 });
  }

  return Response.json({
    budgets: await listBudgetsWithSpend(identity.userId, {
      month: readMonth(request),
    }),
  });
};
