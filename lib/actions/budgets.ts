"use server";

import * as v from "valibot";

import { describeIssues, type ActionResult } from "@/lib/actions/result";
import { SetBudgetSchema } from "@/lib/agent/tools";
import { deleteBudgetFor, setBudgetFor } from "@/lib/db/transactions";
import { findUser } from "@/lib/db/users";
import { resolveUserId } from "@/lib/identity";

/**
 * The dashboard's budget form. Setting goes through the same schema and the same upsert
 * as the agent's set_budget. Deleting is website-only: there is no agent tool for it,
 * so its schema lives here rather than in the tool file.
 */

const DeleteBudgetSchema = v.object({
  id: v.pipe(v.string(), v.uuid("Budget id must be a UUID.")),
});

export const setBudgetAction = async (
  input: unknown,
): Promise<ActionResult> => {
  const identity = await resolveUserId();

  if (!identity.ok) {
    return { ok: false, error: identity.error };
  }

  const parsed = v.safeParse(SetBudgetSchema, input);

  if (!parsed.success) {
    return { ok: false, error: describeIssues(parsed.issues) };
  }

  const user = await findUser(identity.userId);

  if (!user) {
    return { ok: false, error: `No user ${identity.userId}.` };
  }

  await setBudgetFor(
    identity.userId,
    parsed.output,
    user.defaultCurrency,
    new Date(),
  );

  return { ok: true };
};

export const deleteBudgetAction = async (
  input: unknown,
): Promise<ActionResult> => {
  const identity = await resolveUserId();

  if (!identity.ok) {
    return { ok: false, error: identity.error };
  }

  const parsed = v.safeParse(DeleteBudgetSchema, input);

  if (!parsed.success) {
    return { ok: false, error: describeIssues(parsed.issues) };
  }

  const row = await deleteBudgetFor(identity.userId, parsed.output.id);

  if (!row) {
    return { ok: false, error: "That budget no longer exists." };
  }

  return { ok: true };
};
