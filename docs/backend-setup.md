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
3. In **Project settings → API**, copy the **Project URL** and the **anon public**
   key.
4. Put them in `.env`:
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```
   The anon key is meant for the browser; RLS is what protects the data.
5. Restart the dev server. You'll now get a sign-in screen. The first time you sign
   in, a workspace is created and you're added as its owner.

## What's wired so far

- The **sheet** (assets) — the core data path — reads/writes Supabase when
  configured (`SupabaseSheetAdapter`), else localStorage (`MockSheetAdapter`).
- Auth + workspace resolution (`src/lib/session.ts`).

## Next (not yet wired)

- The other entities still use localStorage helpers in the store: clients,
  campaigns, comments, versions, shares, break statuses, audit log. Each moves to
  a `workspace_id` table + RLS following the same pattern (schema stubs noted in
  `schema.sql`).
- Supabase Realtime for live multiplayer across machines.
- Moving the `/api/*` handlers from Vite dev middleware to serverless functions for
  production deploy.
