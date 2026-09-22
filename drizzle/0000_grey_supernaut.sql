CREATE TYPE "public"."transaction_category_expense" AS ENUM('food_drink', 'groceries', 'transport', 'housing', 'utilities', 'health', 'shopping', 'entertainment', 'education', 'travel', 'subscriptions', 'fees_charges', 'gifts_donations', 'other');--> statement-breakpoint
CREATE TYPE "public"."transaction_category_income" AS ENUM('salary', 'bonus', 'freelance', 'investment', 'refund', 'gift', 'other');--> statement-breakpoint
CREATE TYPE "public"."transaction_type" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" bigint NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" char(3) NOT NULL,
	"type" "transaction_type" NOT NULL,
	"category_expense" "transaction_category_expense",
	"category_income" "transaction_category_income",
	"date" date NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_category_matches_type" CHECK (("transactions"."type" = 'expense' AND "transactions"."category_expense" IS NOT NULL AND "transactions"."category_income" IS NULL)
       OR ("transactions"."type" = 'income' AND "transactions"."category_income" IS NOT NULL AND "transactions"."category_expense" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"telegram_id" bigint PRIMARY KEY NOT NULL,
	"username" text,
	"first_name" text,
	"default_currency" char(3) DEFAULT 'IDR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_telegram_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("telegram_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transactions_user_id_date_idx" ON "transactions" USING btree ("user_id","date");