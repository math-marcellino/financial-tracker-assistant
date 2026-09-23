"use client";

import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";

import { deleteBudgetAction, setBudgetAction } from "@/lib/actions/budgets";
import { unwrapAction } from "@/lib/actions/result";
import type { SetBudgetArgs } from "@/lib/agent/tools";

/** Prefix key, so every month's cached copy of the budget list is dropped. */
const useInvalidateBudgets = (userId: number) => {
  const queryClient = useQueryClient();

  return () => queryClient.invalidateQueries({ queryKey: ["budgets", userId] });
};

export const useSetBudget = (
  userId: number,
): UseMutationResult<void, Error, SetBudgetArgs> => {
  const invalidate = useInvalidateBudgets(userId);

  return useMutation({
    mutationFn: (input: SetBudgetArgs) => unwrapAction(setBudgetAction(input)),
    onSuccess: invalidate,
  });
};

export const useDeleteBudget = (
  userId: number,
): UseMutationResult<void, Error, string> => {
  const invalidate = useInvalidateBudgets(userId);

  return useMutation({
    mutationFn: (id: string) => unwrapAction(deleteBudgetAction({ id })),
    onSuccess: invalidate,
  });
};
