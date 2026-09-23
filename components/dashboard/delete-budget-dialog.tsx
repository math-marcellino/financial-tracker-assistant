"use client";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDeleteBudget } from "@/hooks/use-budget-mutations";
import type { BudgetProgress } from "@/lib/db/transactions";
import { formatAmount, humanizeCategory } from "@/lib/format";

/** Names the budget in full, and says plainly that the spending itself stays. */
export const DeleteBudgetDialog = ({
  userId,
  budget,
  onOpenChange,
}: {
  userId: number;
  budget: BudgetProgress | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const remove = useDeleteBudget(userId);

  const close = (open: boolean) => {
    if (!open) remove.reset();
    onOpenChange(open);
  };

  return (
    <AlertDialog open={budget !== null} onOpenChange={close}>
      <AlertDialogContent className="rounded-[var(--radius-sm)] bg-[var(--co-canvas)] p-5 text-[var(--co-ink)]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[1.25rem] font-normal tracking-[-0.2px]">
            Delete this budget?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[var(--co-body-muted)]">
            {budget ? (
              <>
                <span className="capitalize">
                  {humanizeCategory(budget.category)}
                </span>
                {" · "}
                <span className="font-mono tabular-nums">
                  {budget.month.slice(0, 7)}
                </span>
                {" · limit "}
                <span className="font-mono text-[var(--co-ink)] tabular-nums">
                  {formatAmount(budget.limitAmount, budget.currency)}
                </span>
                . The transactions it tracked are not affected.
              </>
            ) : null}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {remove.error ? (
          <p role="alert" className="text-[0.8125rem] text-[var(--co-error)]">
            {remove.error.message}
          </p>
        ) : null}

        <AlertDialogFooter className="mx-0 mb-0 border-t-0 bg-transparent p-0">
          <AlertDialogCancel
            render={
              <button
                type="button"
                className="co-pill-outline px-4 py-2 text-[0.8125rem]"
              />
            }
          >
            Cancel
          </AlertDialogCancel>
          <button
            type="button"
            disabled={remove.isPending || budget === null}
            onClick={() => {
              if (!budget) return;

              remove.mutate(budget.id, { onSuccess: () => close(false) });
            }}
            className="rounded-[var(--radius-pill)] bg-[var(--co-error)] px-4 py-2 text-[0.8125rem] text-[var(--co-on-dark)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {remove.isPending ? "Deleting…" : "Delete"}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
