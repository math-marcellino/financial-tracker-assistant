@AGENTS.md

<!--
================================================================================
HOW TO MAINTAIN THIS FILE
- Lives at the repo root. Loads into context at the START OF EVERY SESSION.
- Target under 200 lines. Longer files consume more context and get followed less.
- If Claude can learn it by reading the repo (folder tree, dependency list, config
  contents), DELETE IT. Keep only pitfalls, rationale, and conventions that differ
  from tool defaults.
- HTML comments like this are stripped before the file enters Claude's context,
  so notes to human maintainers cost zero tokens.
- Line 1 imports AGENTS.md, which Next.js manages and `next dev` rewrites. Add your
  own content there OUTSIDE the BEGIN/END:nextjs-agent-rules markers, or just here.
- Add to this file when: Claude makes the same mistake twice, or you type the same
  correction you typed last session.
- Run `/context` to confirm this file loaded. Run `/doctor` occasionally for trims.
SETUP REQUIRED before the "Definition of done" below is accurate:
  package.json -> "typecheck": "tsc --noEmit"
Sections at the bottom are commented out. Uncomment each one as you install that
tool. Do not leave rules active for packages that are not in package.json.
================================================================================
-->

# Project conventions

<!-- One line on what this app is. Replace this; Claude reads it for intent. -->
A Next.js (App Router) web application: an agentic personal finance tracker. Users log
income/expenses in plain language — via a web chatbox or a Telegram bot — and an LLM
(tool-calling) parses each message into a structured transaction. Both surfaces share one
backend and one Postgres-backed account, keyed by Telegram user ID.

## Commands

- `pnpm dev` — dev server. **Do not run this yourself**; assume it is already running.
- `pnpm build` — production build
- `pnpm lint` / `pnpm lint:fix` — ESLint
- `pnpm typecheck` — `tsc --noEmit`

**Definition of done:** `pnpm lint && pnpm typecheck` both pass before you report a task
complete. A file being written is not evidence that it works. If you cannot run the
checks, say so rather than assuming.

## Agent / tool-calling conventions

- **The tool schema is the product's capability boundary, not an implementation detail.**
  It lives in one file (`lib/agent/tools.ts` or equivalent) and is the single source of
  truth for what the AI can do: `add_transaction`, `edit_transaction`,
  `delete_transaction`, `set_budget`. Adding a new tool is a scope decision — flag it,
  don't just add one to satisfy a prompt.
- **One agent core, three layers.** `lib/agent/handleAgentMessage.ts` is a plain
  function (no `"use server"`, no framework coupling) that runs the LLM + tool-calling
  loop — this is the single canonical implementation. A Server Action wraps it for
  client-form callers (e.g. a manual "add transaction" form on the dashboard). A Route
  Handler wraps it for everything else (the web chatbox's fetch call, and the Telegram
  webhook, which must be a real public HTTP endpoint — a Server Action isn't callable
  from outside Next.js). Never duplicate parsing/categorization logic across these —
  if a fix only gets applied to one wrapper, that's a bug.
- **The LLM only ever proposes tool calls; your code executes them.** Validate every
  tool-call argument (amount is numeric, category is one of the known enum values,
  date parses) with Valibot before writing to Postgres. A model output is untrusted
  input, same as a form submission.
- **Out-of-scope requests get a text explanation, not a forced tool call.** If nothing in
  the schema fits what the user asked, the correct behavior is the model replying in
  plain text — don't add a fallback tool that tries to do "whatever" to avoid this.
- **This workload does not need a queue.** Parsing one message and writing one row is
  fast; run it synchronously in the API route. Don't add BullMQ/Redis here — that's for
  slow background work (video/audio processing), not this.

## Telegram integration

- **Login Widget hash must be verified server-side** against the bot token before trusting
  any identity it sends — never accept a Telegram user ID from the client without that
  check.
- **`TELEGRAM_BOT_TOKEN` and the LLM API key are server secrets.** They are read only in
  route handlers / server actions, never referenced from a client component, and never
  logged.
- **Verify the webhook's secret token** (the one you set when registering the webhook)
  on every incoming request before processing it — an unauthenticated webhook endpoint
  is a public write API.
- **A bot can only message a user after that user has messaged it first.** Don't design a
  flow that assumes the bot can proactively DM someone (e.g. a budget alert) unless
  they've interacted with it at least once.

## Framework pitfalls

These contradict older training data. Follow them over what you remember.

- **Read `node_modules/next/dist/docs/` before writing Next.js code.** Version-matched
  docs ship inside the installed package. Check them for any API you are not certain about.
- **Server Components are the default.** Add `"use client"` only when the file needs hooks,
  event handlers, or browser APIs, and push that boundary as far down the tree as possible.
  Never mark a page as a client component to make one interactive child work — this
  matters especially for the dashboard, where the charts/table need `"use client"` but
  the page shell fetching initial data does not.
- **Tailwind v4 has no config file.** Design tokens live in `app/globals.css` under
  `@theme`. Never create `tailwind.config.*`. Content paths are auto-detected — do not add
  a `content` array anywhere.
- **ESLint uses flat config** in `eslint.config.mjs`. Never create `.eslintrc.*`.
  `next build` no longer runs the linter, so `pnpm lint` must be run explicitly.
- **Config is `next.config.ts`**, not `.js`.
- **Env vars:** only `NEXT_PUBLIC_*` may be referenced in client components. Anything else
  reached from client code is a leak — stop and flag it, do not "fix" it by renaming.
  (`DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and the LLM API key
  are all server-only.)
- **Server Actions are public HTTP endpoints**, not private functions. They need the same
  input validation and authorization check as a route handler, even when the only caller
  is a form in this repo.

## Code conventions

- Import via the `@/` alias. Never climb with `../../`.
- Named exports for components, hooks, and utilities. Default exports only in `app/` route
  files (`page.tsx`, `layout.tsx`, `route.ts`) where the framework requires them.
- Arrow function components, props destructured in the signature.
- Explicit return types on exported functions and hooks. Internal helpers may infer.
- No `any`. Use `unknown` plus narrowing, or a real generic. Do not silence a type error
  with a cast — fix the type or ask. Tool-call arguments coming back from the LLM start as
  `unknown` and must be parsed/validated with Valibot, never cast directly.
- **Valibot, not Zod.** Its pipe-based validators (`v.pipe(v.number(), v.minValue(0))`)
  tree-shake down to only what's imported, which matters for serverless cold starts.
  If you see Zod in a snippet from memory or an old tutorial, translate it.
- Colocate a component's types in its own file unless shared by three or more modules.

## Working agreements

- Use plan mode for anything touching more than ~3 files, any file under `app/api/`, any
  change to auth, middleware, or config, or any change to the tool schema.
  Show the plan before writing code.
- Do not add dependencies without asking first.
- Do not commit or push unless asked. When asked: one logical change per commit,
  Conventional Commits format, no attribution trailers. Real, incremental commit history
  matters for this project specifically — don't squash a work session into one commit.
- Do not create README sections, migration guides, or summary `.md` files unless asked.
- Do not write fallback logic, mock data, or `try/catch` that swallows an error in order to
  make something appear to work. A visible failure is better than a hidden one — this
  applies doubly to the LLM call path: don't silently swallow a failed tool call.
- If the same error appears twice in a row, stop and describe what you tried. Do not
  attempt a third fix.
- Never edit `.env*`, `pnpm-lock.yaml`, or anything in `node_modules/`.

## Data fetching  [enable after installing @tanstack/react-query]
- **Hydration pattern, not plain server-fetch-and-pass-props.** The dashboard needs to
  reactively update after the agent calls a tool (a chat message should make the table/
  chart update live), so plain Server Component `await` isn't enough on its own — prefetch
  in the Server Component with `queryClient.prefetchQuery`, `dehydrate()` the cache, wrap
  the client tree in `<HydrationBoundary>`, then `useQuery` on the client picks up the
  prefetched data with no extra round-trip on first load, and stays reactive after.
- Fetchers live in `lib/api/`. Hooks in `hooks/` wrap them. Components never call `fetch`.
- Query keys are domain-prefixed arrays: `['transactions', userId]`.
- Invalidate by key prefix after a tool call lands (e.g. `['transactions', userId]`) so
  the dashboard reflects a new entry logged from either the web chat or Telegram.

## Components  [enable after `pnpm dlx shadcn@latest init`]
- Add components with `pnpm dlx shadcn@latest add <name>`. The `shadcn-ui` package is
  deprecated — do not use it.
- Files in `components/ui/` are generated but owned by us. Editing them is fine;
  hand-writing new files there from scratch is not.
- Reach for an existing shadcn primitive before building a new form control, dialog, or
  dropdown.

<!-- ## Testing  [enable after installing a test runner]
- `pnpm test` runs the suite and is part of the definition of done.
- Test behaviour through the rendered output, not implementation details. Query by role
  and label, not by test id, unless there is no accessible alternative.
- Do not write a test that asserts what the code currently does in order to make it pass.
  If a test fails, fix the code or say the test is wrong. -->

<!--
DELIBERATELY NOT IN THIS FILE:
- Directory tree / dependency list      -> Claude reads package.json and lists dirs
- Claude Code usage tips, prompt examples -> those are for you; put them in README.md
  (prompt examples here get read as instructions every session)
- Slash command descriptions            -> they live as files in .claude/commands/
- API route security rules              -> .claude/rules/api-security.md, path-scoped so
                                           it loads only when those files are opened
-->
