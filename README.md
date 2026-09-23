# Financial Tracker Assistant

## What it is / how to run it

An AI assistant that records your income and expenses from plain-language messages
("lunch with the team 45k") or receipt photos. You can also ask it about your past
spending. To use it, open https://financial-tracker-assistant-silk.vercel.app/ and sign
in with Telegram. Then chat from the website or the Telegram bot. Send /help (or
/start on Telegram) to see everything it can do. The dashboard shows your
transactions, charts and budgets.

**Demo video:** https://www.loom.com/share/a3544c9e335449bea1ed66a2ba8403d6

## Who it's for, and the one job it does well

For anyone who wants to track their spending but struggles to keep up with it. The one job it does well
is turning a casual chat message into a clean, categorized record, and answering
questions about those records.

## Why this problem, and how I know it's worth solving

It's actually my own problem. When I don't track my spending, I overspend and can't say where
the money went. Tracking is the brake, but I'll only stick with it if recording an expense takes almost zero effort

## What's already out there, and why I built this anyway

Finance apps and spreadsheet templates are everywhere. Nearly all of them rely on
manual entry, and that's why I've stopped using every one I've tried. Here, logging is
like writing a messy note and letting the agent tidy it up, inside a chat app I already
have open.

## What's in scope, what's out, and why

**In:**
- **Web & Telegram chat:** One shared account across both platforms.
- **Automatic categorization:** Automatically categorizes plain-text messages.
- **Receipt scanning:** Recognizes and extracts data from receipt photos.
- **Record management:** Add, edit, and delete records through chat or the dashboard.
- **Monthly budgets & pacing:** Tracks daily spend rate and estimates when limits will be reached.
- **Summaries & charts:** Visual breakdown of where your money went, plus past record summaries.
- **Help menu:** `/help` command listing everything the assistant can do.

**Out, for now:**
- **Bank sync:** A heavy security burden, and not the core point of the tool.
- **Proactive alerts:** Bots can only message users who messaged first; needs opt-in flows.
- **Currency conversion:** Multi-currency support.
- **Shared accounts:** Multi-user shared finances.
- **Recurring transactions:** Automated repeating expenses/incomes.

## Where I didn't have answers, what I assumed

- **Telegram adoption:** Users already have and actively use Telegram.
- **Category coverage:** A preset list of categories is enough for most everyday spending.
- **Single currency:** Most transactions happen in a single, default currency.
- **Default date:** If a date isn't mentioned, the transaction happened today.
- **One receipt, one transaction:** Each receipt photo represents a single transaction.
- **Correct after saving:** Fixing mistakes afterwards (via chat or dashboard) is preferred over adding a friction-heavy confirmation step before saving.

## Three questions I'd ask a real user before building more

1. The last time you tried to track your spending, why did you stop?
2. When the assistant logs something, do you check it, and how often is it wrong?
3. What would you want it to tell you without being asked?

## How I'd know it's working, and what I'd do next

It's working if people are still logging after several weeks, if few entries get
corrected right after they're created, and if most entries take a single message. 

**What I'd do next:**
- **Pace-based budget alerts (Telegram):** Opt-in alerts when spending hits 80% and 100% of a budget limit. Leveraging the existing pace estimate, it can forecast *when* the limit will be exceeded, not just that it's close (only for users who have started the bot).
- **Weekly recaps:** Automated spending summaries sent at the end of each week.
- **Custom categories:** Allowing users to define and customize categories to fit their lifestyle.
- **Recurring transactions:** Tracking repeating bills and subscriptions, prioritized by user feedback.

## How I used AI

- **In the product:** An LLM with tool calling processes each message, while application code validates all tool arguments before data is saved.
- **In development:** I used AI from the very beginning—brainstorming ideas, evaluating what was feasible within a short timeframe, and discussing the system design and tech stack. Once finalized, I documented these architectural decisions and conventions in `CLAUDE.md` to keep generated code consistent, using Claude Code to accelerate the entire implementation.
- **Where it went wrong (and how it was fixed):** The assistant initially classified internal money transfers (such as ATM withdrawals or e-wallet top-ups) as income, artificially inflating earnings. Caught during testing, it now asks for clarification whenever a message might be an internal transfer rather than real income.
