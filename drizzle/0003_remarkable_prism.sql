ALTER TABLE "messages" ADD COLUMN "transaction_snapshot" jsonb;--> statement-breakpoint
-- Backfill from the live rows. These freeze current state, not the state at the time --
-- that history was never recorded, so an already-edited transaction stays inconsistent
-- with its older reply text. New turns snapshot correctly.
UPDATE "messages" m
SET "transaction_snapshot" = jsonb_build_object(
  'id', t."id",
  'amount', t."amount",
  'currency', t."currency",
  'type', t."type",
  'category', coalesce(t."category_expense"::text, t."category_income"::text),
  'date', to_char(t."date", 'YYYY-MM-DD'),
  'note', t."note"
)
FROM "transactions" t
WHERE m."transaction_id" = t."id" AND m."transaction_snapshot" IS NULL;
