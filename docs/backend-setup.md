# Backend setup (Supabase)

The app runs on **localStorage** out of the box (the mock adapters), so you can
ignore this until you want a real, multi-user backend. Adding Supabase is
additive: nothing changes until both env vars are set.

## What the backend gives you

- **Durable, multi-user data** (Postgres) instead of one browser's localStorage.
- **Real auth** (Supabase Auth) — a sign-in screen appears only once configured.
- **Server-enforced access control** via Row-Level Security. The roles in
  `src/domain/access.ts` (owner / editor / stakeholder) become real: RLS, not the
  UI, decides who can read or write. (Today, without a backend, gating is UI-only.)
- The foundation for **true cross-machine multiplayer** (Supabase Realtime), which
  will replace the cross-tab BroadcastChannel.

## Steps

1. Create a Supabase project at https://supabase.com.
2. In the project's **SQL editor**, paste and run [`supabase/schema.sql`](../supabase/schema.sql).
   This creates `workspaces`, `workspace_members`, and `assets`, with RLS policies.

   **For a project created before a given migration shipped**, also run the files in
   [`supabase/migrations/`](../supabase/migrations) that postdate it, in order. `schema.sql` is the
   full picture for a FRESH project; the migrations are how an existing database catches up. They
   are idempotent, so running one that has already been applied is a no-op.

   This is worth doing rather than deferring: a table that does not exist does not announce itself.
   The Supabase client answers a write to a missing table with an error object instead of throwing,
   so an un-run migration looks exactly like a working sync until someone opens the table and finds
   it empty. `npm test` now fails if the code writes to a table the SQL never creates
   (`src/adapters/__tests__/schemaCoverage.test.ts`), but it cannot tell whether YOUR database has
   had the SQL run against it.
3. In **Project settings → API Keys**, copy the **Project URL** and the browser-safe
   key. Supabase now issues these as **publishable** keys (`sb_publishable_…`) and keeps
   the classic anon JWT (`eyJ…`) on a separate **Legacy anon, service_role** tab. Either
   works — `src/lib/supabase.ts` hands the string straight to `createClient` and never
   looks at its shape — so prefer the publishable key on a new project.

   Take the **publishable** one, never the secret. A key labelled `sb_secret_…` or
   `service_role` bypasses RLS entirely, and putting one in a `VITE_` variable ships it
   to every browser that loads the app.
4. Put them in `.env`:
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=sb_publishable_...
   ```
   The variable keeps its name for compatibility; what it holds is whichever browser-safe
   key you copied. That key is meant to be public — RLS is what protects the data.
5. Restart the dev server. You'll now get a sign-in screen. The first time you sign
   in, a workspace is created and you're added as its owner.
6. Optional: to offer **Sign in with Google** as well as email and password, follow
   [`docs/google-sign-in.md`](google-sign-in.md). It needs no new env vars — the
   credentials live in the Supabase dashboard, not in `.env` — but it does need a
   Google Cloud OAuth client, and the redirect URI it asks for is Supabase's callback
   rather than this app's address, which is the step everyone gets wrong once.

## What's wired so far

- The **sheet** (assets) — the core data path — reads/writes Supabase when
  configured (`SupabaseSheetAdapter`), else localStorage (`MockSheetAdapter`).
- Auth + workspace resolution (`src/lib/session.ts`).

- The **record lists** (companies, people, segments, brands, products, concepts, …) —
  one table each, via `SupabaseRecordAdapter`.
- **Keyed state** (clients, campaigns, brand systems, comments, chats, …) — one jsonb
  row per key in `workspace_state`, via `persistState` / `hydrateState`.
- The **audit trail** and **campaign version history** — append-only tables
  (`audit_log`, `campaign_versions`), via `src/adapters/history/historyStore.ts`.
  Neither grants UPDATE: an entry you can rewrite is not a record of what happened.

## Next (not yet wired)

- **Uploaded media has no home.** Dropping an image or video stores a `blob:` object
  URL in `assets.row.mediaRef` — a handle that dies with the tab and means nothing on
  another device — and a dropped PDF stores nothing at all. Only text assets survive,
  because `.md` / `.txt` / `.html` / `.json` are read inline into `row.body`. This
  wants a Supabase Storage bucket and an upload on ingest.
- **Channel login sessions are on the server's disk**, not in the database:
  `server/sessionStore.ts` writes Playwright `storageState` (real login cookies for
  clients' accounts) under `.rushhour/sessions/`, which is ephemeral on Vercel. These
  are credentials; `workspace_connections.credentials` is the service-role-only column
  built for exactly this.
- **Still per-browser**, some deliberately (saved views, pinned insights, open
  projects, active canvas, break status, onboarding) and some only because they
  predate the backend: brand actuals, drive links, brand datasets, conditions,
  coherence decisions, artboards, canvas card positions, campaign RTBs, accounts /
  target lists / campaign target, share grants, ai model choice.
- Supabase Realtime for live multiplayer across machines.
- Moving the `/api/*` handlers from Vite dev middleware to serverless functions for
  production deploy.
