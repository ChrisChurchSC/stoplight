# Breadcrumbs

Marketing infrastructure and automation. Breadcrumbs turns one brand strategy into
personalized campaigns for every audience and channel — you set the strategy once, and
the work downstream of it stays consistent with it.

> The repository is named `stoplight` for historical reasons; the product is Breadcrumbs.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

It runs with no credentials at all. Every AI feature has a deterministic fallback, so
without a model key you get the heuristic result rather than an error, and without
Supabase the app keeps its data in `localStorage`. Add keys to turn each part on —
`.env.example` lists them and says what each one unlocks.

```bash
npm run typecheck  # tsc -b --noEmit
npm test           # vitest
npm run build      # typecheck + production build
```

## How the app is put together

The workspace is a brand and the work hanging off it. `Workbench` is the shell; the
views inside it (flows, canvas, records, calendar, library, insights) all read one
Zustand store, `src/store/useTrafficStore.ts`, which is also where the adapter seams are
wired.

```
src/
  domain/      types, channels, taxonomy, and the pure logic (scoring, breaks, signals)
  adapters/    one folder per seam — copy, records, metrics, publishers, setup, ...
  store/       useTrafficStore.ts — state plus the seam wiring
  components/  the views
  lib/         supabase, session, sharing, file/media handling
server/        the /api handlers (model calls, ingestion, publishing)
api/           [...path].ts — the single serverless function that serves them in production
```

Anything that talks to a model or a third party lives behind an adapter, so the UI does
not change when a real integration replaces a heuristic one.

## The /api layer

Handlers live in `server/` and are environment-agnostic: parsed body in, JSON out. What
differs is who calls them.

- **Production** — `api/[...path].ts`, one Vercel function serving every route. Vercel's
  Hobby plan caps a deployment at 12 functions, so a catch-all rather than a file each.
- **Dev** — middleware in `vite.config.ts`, mounted on the same paths.

Both read the same route table, **`server/apiManifest.ts`**. That is deliberate: the two
lists used to be maintained separately and drifted, which shipped real bugs — three
endpoints that worked on localhost and 404'd on the pilot, and one that shipped as its
own unauthenticated function and answered the model account's balance to anyone who
asked. `server/__tests__/apiManifest.test.ts` now fails the build if they stop agreeing,
if a route the client calls has no handler, or if the browser-automation graph reaches
the deployed bundle.

Routes that genuinely cannot deploy live in `server/devApiManifest.ts`, which the
serverless function never imports. They drive a real browser (Playwright) or stream SSE:
`setup`, `map-site`, `map-site-stream`, `ingest-channel`, the CRM ingests, and
`connect/*`. Their callers degrade gracefully when they 404 in production. `DEPLOY.md`
covers what is live and what is not.

Errors carry a contract: `NO_KEY` (and an exhausted budget) become **501**, which every
client adapter reads as "the model is unavailable, use the fallback". A 500 would surface
as a crash and skip the fallback.

## Models

`server/modelClient.ts` is the one client. Handlers build requests in Anthropic's
Messages shape; the client runs them against **OpenRouter** (default, when
`OPENROUTER_API_KEY` is set) or **Anthropic directly** (`ANTHROPIC_API_KEY`), translating
in both directions so handlers never know which answered.

## Data

Supabase provides auth and sync; `supabase/schema.sql` plus `supabase/migrations/` define
the schema, and RLS scopes every row to a workspace. With Supabase unconfigured the app
falls back to `localStorage`, which is also how share links work — a `?share=` token is a
self-contained grant that needs no account. The published snapshot behind that token is served to
anyone who is not a member of the workspace that published it, signed in or not: having an account
is not having access, and someone who signs up *from* the link lands in an empty workspace of their
own (see `src/domain/shareAccess.ts`).

## Also here

- `mcp/breadcrumbs-server.mjs` — MCP server letting Claude Desktop drive a dev tab
  (`docs/claude-desktop-mcp.md`).
- `scripts/regression-*.mts` — standalone regression checks over the pure domain logic.
- `docs/` — setup briefs and per-feature plans.
- `DEPLOY.md` — deploying to Vercel, and what works in production versus locally.
