# Deploying Magnetic Matter for a pilot

This gets the app in front of a handful of trusted users. Data stays in each user's browser for now
(no server sync yet — that's the "real product" follow-up); this covers hosting, the AI backend,
access, and cost control.

## Architecture (what deploys)

- **Frontend** — a static Vite build (`dist/`).
- **AI backend** — the `/api/*` endpoints. In local dev these are served by Vite middleware
  (`vite.config.ts`); in production the files in **`api/*.ts`** run as Vercel serverless functions,
  wrapping the same handlers in `server/`. The client calls the same `/api/...` paths either way.
- **Data** — browser `localStorage`. Nothing is stored server-side yet.
- **Auth** — `AuthGate` (Supabase). Off by default; turns on when the Supabase env vars are set.

### What works in production vs. local-only

Serverless (work when deployed, given a key): `claude-ask`, `draft-copy`, `draft-cell`,
`coherence-check`, `media-mix`, `flow-agent`, `icp-review`, `extract-copy`, `claude-agent`,
`publish`, `publish-email`, `ai-status`.

Local-dev only (they open a real browser, so they're **not** deployed — the UI degrades gracefully):
`setup`, `map-site` / `map-site-stream`, `ingest-channel`, `connect/*`. The streaming CRM ingests
(`ingest-sanity/resend/google-ads/neon`) aren't wired for serverless yet — a follow-up if a pilot
user needs them.

## Steps

1. **Merge the branch.** Open a PR for `remove-campaigns` → `main`, review, merge. Deploy from `main`.
2. **Create a Vercel project** and connect the GitHub repo. Vercel auto-detects Vite; `vercel.json`
   already sets the build command, output dir, and function `maxDuration`.
3. **Set environment variables** in Vercel (Project → Settings → Environment Variables). See below.
4. **Turn on access** — set the Supabase vars (step below); `AuthGate` then requires sign-in. Create
   pilot users in the Supabase dashboard (invite-only). Optionally also enable Vercel **Deployment
   Protection** for a second lock.
5. **Set a hard cost cap** in the Anthropic console (a monthly spend limit) — this is the real
   backstop. The functions also have a best-effort per-instance rate guard (40 req/min).
6. **Deploy**, sign in, click through the AI features to confirm the key is live (the "Connect
   Claude" step reads `/api/ai-status`).

## Environment variables

Server-side (used by the `api/*` functions — **never** `VITE_`-prefixed, so they never reach the browser):

| Var | Needed for |
|---|---|
| `ANTHROPIC_API_KEY` **or** `OPENROUTER_API_KEY` | All Claude features (required — without it everything falls back to heuristics) |
| `OPENROUTER_MODEL` | Optional, if using OpenRouter |
| `BUFFER_ACCESS_TOKEN`, `BUFFER_PROFILE_IDS` | `publish` (social) |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_AUDIENCE_ID` | `publish-email` |

Client-side auth (these **are** `VITE_`-prefixed and shipped to the browser — that's expected; the
anon key is public by design, secured by Supabase Row Level Security):

| Var | Effect |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Turns on sign-in. Omit both to run open/unauthenticated. |

Keep real values in Vercel's env settings (and local `.env`, which is git-ignored) — never commit them.

## Known limits for the pilot (say these to users)

- **Data is per-browser.** Clearing site data or switching devices loses it; no teams/sharing yet.
- Site-crawl onboarding and channel-connect ingests are disabled in the hosted build (local-only).
- Rate limiting is best-effort (per warm instance). A real cross-instance limit needs Vercel KV.

## The real-product next step

Persist app state to Supabase (auth already wires per-user sessions; the data model in
`useTrafficStore` needs a sync layer to Postgres) so data survives, syncs, and can be shared.
