-- Migration: the three record tables the app was already writing to but that never existed, plus
-- durable homes for the audit trail and campaign version history.
--
-- WHY THIS EXISTS. saveRecordList() has been mirroring `products`, `brand_objects` and
-- `library_folders` to Supabase since those record kinds shipped, but no migration ever created
-- them. postgrest-js resolves with an { error } object instead of throwing, and the call site
-- discards the promise, so every one of those writes reported success and went nowhere. Worse for
-- library_folders, which hydrateRecords() also READS: a missing table answers with an empty list,
-- and that empty list was patched over the store on every sign-in.
--
-- Run it in the Supabase dashboard SQL editor (Project → SQL Editor → New query → paste → Run).
-- Idempotent (create if not exists / drop policy if exists) and additive, and it reuses the same
-- is_member / is_editor RLS helpers as every other table.

-- ── Record tables (same shape + policies as companies, voice_records, …) ────
do $$
declare t text;
begin
  foreach t in array array['products', 'brand_objects', 'library_folders'] loop
    execute format($f$
      create table if not exists public.%1$I (
        id           text primary key,
        workspace_id uuid not null references public.workspaces on delete cascade,
        name         text,
        data         jsonb not null,
        updated_at   timestamptz not null default now()
      )$f$, t);
    execute format('create index if not exists %I on public.%I (workspace_id)', t || '_workspace_idx', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select using (public.is_member(workspace_id))', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format(
      'create policy %I on public.%I for all using (public.is_editor(workspace_id)) with check (public.is_editor(workspace_id))',
      t || '_write', t
    );
  end loop;
end $$;

-- ── Audit log (the disclosure trail) ───────────────────────────────────────
-- Every coherence check result and every action taken on one. Append-only at the DATABASE level,
-- not merely by convention: members select and editors insert, and there is deliberately no update
-- or delete policy, so a trail entry cannot be edited or quietly removed by a client. That is the
-- property that makes it an audit trail rather than a list.
--
-- The columns are the ones worth querying / indexing; the full AuditEntry stays in `data` so the
-- shape can evolve without a migration (same convention as assets.row and the record tables).
create table if not exists public.audit_log (
  id           text primary key,
  workspace_id uuid not null references public.workspaces on delete cascade,
  break_id     text,
  action       text not null,
  actor        text,
  at           bigint not null,
  data         jsonb not null,
  created_at   timestamptz not null default now()
);
create index if not exists audit_log_workspace_idx on public.audit_log (workspace_id, at desc);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log
  for select using (public.is_member(workspace_id));

drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert on public.audit_log
  for insert with check (public.is_editor(workspace_id));

-- ── Campaign version history (copy save-points) ────────────────────────────
-- A snapshot of every scoped asset's copy at a moment, attributed to whoever saved it. Restoring a
-- version writes its copy back onto the rows (an assets update) and never mutates the version, so
-- there is no update policy: a save point you can rewrite is not a save point.
--
-- Unlike the audit log this DOES grant delete, because deleting a brand purges its version history
-- along with everything else that made the brand exist (see brandPurgePatch). Without it the purge
-- would succeed locally and leave the rows on the server, and a fresh device would hydrate the
-- deleted brand's history straight back — the exact orphan bug that function was written to fix.
create table if not exists public.campaign_versions (
  id           text primary key,
  workspace_id uuid not null references public.workspaces on delete cascade,
  client       text not null,
  label        text,
  author       text,
  ts           bigint not null,
  data         jsonb not null,
  created_at   timestamptz not null default now()
);
create index if not exists campaign_versions_ws_client_idx on public.campaign_versions (workspace_id, client, ts desc);

alter table public.campaign_versions enable row level security;

drop policy if exists campaign_versions_select on public.campaign_versions;
create policy campaign_versions_select on public.campaign_versions
  for select using (public.is_member(workspace_id));

drop policy if exists campaign_versions_insert on public.campaign_versions;
create policy campaign_versions_insert on public.campaign_versions
  for insert with check (public.is_editor(workspace_id));

drop policy if exists campaign_versions_delete on public.campaign_versions;
create policy campaign_versions_delete on public.campaign_versions
  for delete using (public.is_editor(workspace_id));
