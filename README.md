# Financial Tracker Assistant

## What it is / how to run it

An AI assistant that records your income and expenses from plain-language messages
("lunch with the team 45k") or receipt photos. You can also ask it about your past
spending. To use it, open https://financial-tracker-assistant-silk.vercel.app/ and sign
in with Telegram. Then chat from the website or the Telegram bot
([@financial_tracker_assistant_bot](https://t.me/financial_tracker_assistant_bot)). Send /help (or
/start on Telegram) to see everything it can do. The dashboard shows your
transactions, charts and budgets.

**Demo video:** https://www.loom.com/share/a3544c9e335449bea1ed66a2ba8403d6

## Who it's for, and the one job it does well

For anyone who wants to track their spending but struggles to keep up with it. The one job it does well
is turning a casual chat message into a clean, categorized record, and answering
questions about those records.

## Why this problem, and how I know it's worth solving

It's my own problem. When I don't track my spending, I overspend and can't say where
the money went. I've started and quit every finance app I've tried, always for the same
reason: logging takes too much effort. If that effort drops to almost zero, I'll keep tracking.

## What's already out there, and why I built this anyway

Finance apps and spreadsheet templates are everywhere. Nearly all of them rely on
manual entry, and that's why I've stopped using every one I've tried. Here, logging is
like writing a messy note and letting the agent tidy it up, inside a chat app I already
have open.

## What's in scope, what's out, and why

**In:** Web and Telegram chat on one shared account; logging from text or receipt photos
with automatic categorization; editing records via chat or the dashboard; monthly
budgets with pace estimates; charts and spending summaries.

**Out, for now:**
- **Bank sync:** A heavy security burden, and not the core point of the tool.
- **Proactive alerts:** Bots can only message users who messaged first, so this needs an opt-in flow.
- **Multi-currency:** Needs exchange rates, and most of my spending is in one currency.
- **Shared accounts:** Adds permissions and shared ownership of records; the core use is personal.
- **Recurring transactions:** Useful, but secondary to fast one-off logging. It should wait for user demand.

## Where I didn't have answers, what I assumed

- **Telegram adoption:** Users already have and actively use Telegram.
- **Category coverage:** A preset list of categories covers most everyday spending.
- **Single currency:** Most transactions happen in one default currency.
- **Correct after saving:** Fixing a mistake afterwards beats a confirmation step before every save.

## Three questions I'd ask a real user before building more

1. The last time you tried to track your spending, why did you stop?
2. When the assistant logs something, do you check it, and how often is it wrong?
3. What would you want it to tell you without being asked?

## How I'd know it's working, and what I'd do next

It's working if people are still logging after several weeks, if few entries get
corrected right after they're created, and if most entries take a single message.

**Next:**
- **Budget alerts on Telegram:** Opt-in alerts at 80% and 100% of a budget, using the existing pace estimate to forecast when the limit will be hit.
- **Custom categories:** Let users define categories that fit their lifestyle.
- **Recurring transactions:** Track bills and subscriptions, if users ask for it.

## How I used AI

- **In the product:** An LLM with tool calling turns each message into a record. Application code validates every tool argument before anything is saved.
- **In development:** AI helped me brainstorm, scope what fit the timeframe, and choose the system design and stack. I wrote those decisions into `CLAUDE.md` so the code Claude Code generated stayed consistent.
- **Where it went wrong:** The assistant logged internal transfers (ATM withdrawals, e-wallet top-ups) as income, which inflated earnings. I caught it in testing; it now asks for clarification when a message might be a transfer.
