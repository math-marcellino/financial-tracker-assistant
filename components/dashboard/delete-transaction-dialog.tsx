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
import { useDeleteTransaction } from "@/hooks/use-transaction-mutations";
import type { DashboardTransaction } from "@/lib/db/transactions";
import { formatAmount, humanizeCategory } from "@/lib/format";

/**
 * Deletes are permanent — there is no trash — so the row being removed is named in
 * full before anything happens.
 */
export const DeleteTransactionDialog = ({
  userId,
  transaction,
  onOpenChange,
}: {
  userId: number;
  transaction: DashboardTransaction | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const remove = useDeleteTransaction(userId);

  const close = (open: boolean) => {
    if (!open) remove.reset();
    onOpenChange(open);
  };

  return (
    <AlertDialog open={transaction !== null} onOpenChange={close}>
      <AlertDialogContent className="rounded-[var(--radius-sm)] bg-[var(--co-canvas)] p-5 text-[var(--co-ink)]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-[1.25rem] font-normal tracking-[-0.2px]">
            Delete this transaction?
          </AlertDialogTitle>
          <AlertDialogDescription className="text-[var(--co-body-muted)]">
            {transaction ? (
              <>
                <span className="font-mono text-[var(--co-ink)] tabular-nums">
                  {transaction.type === "expense" ? "−" : "+"}
                  {formatAmount(transaction.amount, transaction.currency)}
                </span>
                {" · "}
                <span className="capitalize">
                  {humanizeCategory(
                    transaction.categoryExpense ?? transaction.categoryIncome,
                  )}
                </span>
                {" · "}
                {transaction.date}. This can&rsquo;t be undone.
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
            disabled={remove.isPending || transaction === null}
            onClick={() => {
              if (!transaction) return;

              remove.mutate(transaction.id, { onSuccess: () => close(false) });
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
