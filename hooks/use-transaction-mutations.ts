"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";

import { unwrapAction } from "@/lib/actions/result";
import {
  addTransactionAction,
  deleteTransactionAction,
  editTransactionAction,
} from "@/lib/actions/transactions";
import type {
  AddTransactionArgs,
  EditTransactionArgs,
} from "@/lib/agent/tools";

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
      unwrapAction(addTransactionAction(input)),
    onSuccess: invalidate,
  });
};

export const useEditTransaction = (
  userId: number,
): UseMutationResult<void, Error, EditTransactionArgs> => {
  const invalidate = useInvalidateAfterWrite(userId);

  return useMutation({
    mutationFn: (input: EditTransactionArgs) =>
      unwrapAction(editTransactionAction(input)),
    onSuccess: invalidate,
  });
};

export const useDeleteTransaction = (
  userId: number,
): UseMutationResult<void, Error, string> => {
  const invalidate = useInvalidateAfterWrite(userId);

  return useMutation({
    mutationFn: (id: string) => unwrapAction(deleteTransactionAction({ id })),
    onSuccess: invalidate,
  });
};
