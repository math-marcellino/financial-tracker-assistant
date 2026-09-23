"use server";

import * as v from "valibot";

import {
  AddTransactionSchema,
  DeleteTransactionSchema,
  EditTransactionSchema,
} from "@/lib/agent/tools";
import {
  createTransactionFor,
  deleteTransactionFor,
  editTransactionFor,
} from "@/lib/db/transactions";
import { findUser } from "@/lib/db/users";
import { resolveUserId } from "@/lib/identity";

/**
 * The dashboard's manual path to the same writes the agent makes. These are public POST
 * endpoints like any Server Action, so every one resolves the caller's identity and
 * validates its input against the same Valibot schemas the LLM's tool calls go through:
 * a form submission is exactly as untrusted as a model output.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

/** The first issue, with the field it belongs to, so the form can say what's wrong. */
const describeIssues = (issues: [v.BaseIssue<unknown>, ...v.BaseIssue<unknown>[]]) => {
  const [issue] = issues;
  const field = v.getDotPath(issue);

  return field ? `${field}: ${issue.message}` : issue.message;
};

export const addTransactionAction = async (
  input: unknown,
): Promise<ActionResult> => {
  const identity = await resolveUserId();

  if (!identity.ok) {
    return { ok: false, error: identity.error };
  }

  const parsed = v.safeParse(AddTransactionSchema, input);

  if (!parsed.success) {
    return { ok: false, error: describeIssues(parsed.issues) };
  }

  const user = await findUser(identity.userId);

  if (!user) {
    return { ok: false, error: `No user ${identity.userId}.` };
  }

  await createTransactionFor(
    identity.userId,
    parsed.output,
    user.defaultCurrency,
  );

  return { ok: true };
};

export const editTransactionAction = async (
  input: unknown,
): Promise<ActionResult> => {
  const identity = await resolveUserId();

  if (!identity.ok) {
    return { ok: false, error: identity.error };
  }

  const parsed = v.safeParse(EditTransactionSchema, input);

  if (!parsed.success) {
    return { ok: false, error: describeIssues(parsed.issues) };
  }

  const outcome = await editTransactionFor(identity.userId, parsed.output);

  if (outcome.status === "not_found") {
    return { ok: false, error: "That transaction no longer exists." };
  }

  if (outcome.status === "rejected") {
    return { ok: false, error: outcome.reason };
  }

  return { ok: true };
};

export const deleteTransactionAction = async (
  input: unknown,
): Promise<ActionResult> => {
  const identity = await resolveUserId();

  if (!identity.ok) {
    return { ok: false, error: identity.error };
  }

  const parsed = v.safeParse(DeleteTransactionSchema, input);

  if (!parsed.success) {
    return { ok: false, error: describeIssues(parsed.issues) };
  }

  const row = await deleteTransactionFor(identity.userId, parsed.output.id);

  if (!row) {
    return { ok: false, error: "That transaction no longer exists." };
  }

  return { ok: true };
};
