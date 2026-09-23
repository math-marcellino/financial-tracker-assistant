import * as v from "valibot";

/**
 * Shared by every Server Action file. It lives outside them because a "use server"
 * module may only export async functions.
 *
 * A rejected write is returned, not thrown: a Server Action's thrown message is
 * redacted in production, and the form needs to say what was wrong.
 */
export type ActionResult = { ok: true } | { ok: false; error: string };

/** The first issue, with the field it belongs to, so the form can say what's wrong. */
export const describeIssues = (
  issues: [v.BaseIssue<unknown>, ...v.BaseIssue<unknown>[]],
): string => {
  const [issue] = issues;
  const field = v.getDotPath(issue);

  return field ? `${field}: ${issue.message}` : issue.message;
};

/**
 * Client side: turns `{ ok: false }` back into a thrown error, so a mutation's `error`
 * carries it the same way it carries a network failure.
 */
export const unwrapAction = async (
  result: Promise<ActionResult>,
): Promise<void> => {
  const outcome = await result;

  if (!outcome.ok) {
    throw new Error(outcome.error);
  }
};
