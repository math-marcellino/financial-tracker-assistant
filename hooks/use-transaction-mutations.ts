"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";

import {
  addTransactionAction,
  deleteTransactionAction,
  editTransactionAction,
  type ActionResult,
} from "@/lib/actions/transactions";
import type {
  AddTransactionArgs,
  EditTransactionArgs,
} from "@/lib/agent/tools";

/**
 * A rejected write comes back as `{ ok: false }` rather than a thrown error, because a
 * Server Action's thrown message is redacted in production. It is re-thrown here so the
 * form sees it through the mutation's `error`, the same as a network failure.
 */
const unwrap = async (result: Promise<ActionResult>): Promise<void> => {
  const outcome = await result;

  if (!outcome.ok) {
    throw new Error(outcome.error);
  }
};

/**
 * Prefix keys, so every month's cached copy is dropped, not just the one on screen. A
 * write moves budget spend and can add or empty a month, so those refresh too.
 */
const useInvalidateAfterWrite = (userId: number) => {
  const queryClient = useQueryClient();

  return () =>
    Promise.all(
      [
        ["transactions", userId],
        ["budgets", userId],
        ["months", userId],
      ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    );
};

export const useAddTransaction = (
  userId: number,
): UseMutationResult<void, Error, AddTransactionArgs> => {
  const invalidate = useInvalidateAfterWrite(userId);

  return useMutation({
    mutationFn: (input: AddTransactionArgs) =>
      unwrap(addTransactionAction(input)),
    onSuccess: invalidate,
  });
};

export const useEditTransaction = (
  userId: number,
): UseMutationResult<void, Error, EditTransactionArgs> => {
  const invalidate = useInvalidateAfterWrite(userId);

  return useMutation({
    mutationFn: (input: EditTransactionArgs) =>
      unwrap(editTransactionAction(input)),
    onSuccess: invalidate,
  });
};

export const useDeleteTransaction = (
  userId: number,
): UseMutationResult<void, Error, string> => {
  const invalidate = useInvalidateAfterWrite(userId);

  return useMutation({
    mutationFn: (id: string) => unwrap(deleteTransactionAction({ id })),
    onSuccess: invalidate,
  });
};
