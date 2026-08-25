# Deploying Breadcrumbs for a pilot

This gets the app in front of a handful of trusted users. It covers hosting, the AI backend, access,
data sync, and cost control. When Supabase is configured, records and app state sync to Postgres per
workspace (RLS-protected) and survive across devices; without Supabase the app runs on `localStorage`,
unchanged.

## Architecture (what deploys)

- **Frontend** — a static Vite build (`dist/`).
- **AI backend** — the `/api/*` endpoints. In local dev these are served by Vite middleware
  (`vite.config.ts`); in production the files in **`api/*.ts`** run as Vercel serverless functions,
  wrapping the same handlers in `server/`. The client calls the same `/api/...` paths either way.
- **Data** — `localStorage` by default. With Supabase configured, the record lists (companies,
  people, segments, channels, objectives, messages, brands) persist to normalized Postgres tables and
  the app state (brand system, client list, campaign metadata, reports, per-sheet grouping, …) to a
  `workspace_state` KV table — both scoped per workspace and RLS-protected, so data syncs across
  devices. Tasks are still `localStorage`-only (next follow-up).
- **Auth** — `AuthGate` (Supabase). Off by default; turns on when the Supabase env vars are set. First
  sign-in creates the user's workspace, which then scopes all synced data.

### What works in production vs. local-only

Serverless (work when deployed, given a key): `claude-ask`, `draft-copy`, `draft-cell`,
`coherence-check`, `media-mix`, `flow-agent`, `icp-review`, `extract-copy`, `claude-agent`,
`publish`, `publish-email`, `ai-status`.

Local-dev only (they open a real browser, so they're **not** deployed — the UI degrades gracefully):
`setup`, `map-site` / `map-site-stream`, `ingest-channel`, `connect/*`. The streaming CRM ingests
(`ingest-sanity/resend/google-ads/neon`) aren't wired for serverless yet — a follow-up if a pilot
user needs them.

## Steps

For a quick pilot, deploy a **preview** straight from the working branch (no merge needed) with the
Vercel CLI; promote to production / `main` once it's proven.

1. **Provision Supabase** (enables auth + data sync). Create a project, open the SQL editor, and run
   `supabase/schema.sql`. Copy the project **URL** and **anon key** (Project → Settings → API). The
   anon key is public by design; RLS protects the data.

   `schema.sql` also creates the **`creative` storage bucket** — where a card's finished artwork
   goes. On an existing database, run `supabase/migrations/0015_creative_storage.sql` once instead.
   Until it exists, uploads still work but stay on the uploader's device and the card says so, so
   nobody else can open them. The bucket allows objects up to 200MB; the project's own global upload
   limit (Settings → Storage) is separate and lower by default, so raise it too if finished video
   needs to land.
2. **Set environment variables** in Vercel (`vercel env add …`, or Project → Settings → Environment
   Variables). At minimum `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (turns on sign-in + sync) and
   `ANTHROPIC_API_KEY` (turns on the AI features). See the table below.
3. **Deploy.** `vercel` for a preview URL, `vercel --prod` to promote. Vercel reads `vercel.json`
   (framework `vite`, build command, output dir, function `maxDuration`). Preview URLs are unguessable
   but public; add Vercel **Deployment Protection** if you want a hard lock.
4. **Create pilot users** in the Supabase dashboard (invite-only) — sign-in is then required and each
   user gets their own workspace.
5. **Set a hard cost cap** in the Anthropic console (a monthly spend limit) — the real backstop. The
   functions also have a best-effort per-instance rate guard (40 req/min).
6. **Smoke-test.** Sign in; confirm the app loads and records edit. Add a company on one browser,
   sign in on another, confirm it syncs. Click through the AI features (the "Connect Claude" step
   reads `/api/ai-status`) to confirm the key is live.

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

- **Without Supabase, data is per-browser.** Clearing site data or switching devices loses it. With
  Supabase configured it syncs per workspace. Sharing works via **invite links** (the person icon in
  the left rail → "Invite a teammate" → share the link; the invitee signs in and joins the workspace).
- New users are routed into the **setup flow** on first sign-in (paste a site → Claude builds a
  starting brand + records); existing local data is carried over by the one-time **Import** banner.
- Site-crawl onboarding and channel-connect ingests are disabled in the hosted build (local-only).
- Rate limiting is best-effort (per warm instance). A real cross-instance limit needs Vercel KV.

## The real-product next steps

Record lists, tasks, library folders, and app state all sync to Supabase per workspace (RLS-enforced),
and members join a workspace via invite links (`workspace_invites` + the `claim_invite` function).
Remaining to reach a fuller multi-user product: a workspace switcher (users can belong to several),
per-member role management UI, and moving rate limiting to a cross-instance store (Vercel KV).
