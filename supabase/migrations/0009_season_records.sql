-- Migration: add the `season_records` table (Records › Message › Seasons).
--
-- A Season is a moment worth writing to: the moment itself, when it runs, and — the part that earns
-- the record — what it gives the brand permission to say. It became a record kind when the Season
-- card stopped being free text, and a card wired to the campaign now sends it to the copy writer.
--
-- schema.sql includes `season_records` in its record-table loop, so a fresh apply creates it.
-- For an EXISTING database (e.g. production), run this standalone migration once — it is idempotent
-- (create if not exists / drop policy if exists) and additive, and reuses the same is_member /
-- is_editor RLS helpers as every other record table (companies, message_records, voice_records, …).
--
-- UNTIL THIS IS APPLIED, concepts are localStorage-only. saveRecordList fires the sync and never
-- reads the result, and the Supabase client returns an error object rather than throwing, so a
-- missing table fails silently: the app looks like it is syncing and is not. That is the reason to
-- run this rather than leave it queued.
--
-- Run it in the Supabase dashboard SQL editor (Project → SQL Editor → New query → paste → Run).

create table if not exists public.season_records (
  id           text primary key,
  workspace_id uuid not null references public.workspaces on delete cascade,
  name         text,
  data         jsonb not null,
  updated_at   timestamptz not null default now()
);

create index if not exists season_records_workspace_idx on public.season_records (workspace_id);

alter table public.season_records enable row level security;

drop policy if exists season_records_select on public.season_records;
create policy season_records_select on public.season_records
  for select using (public.is_member(workspace_id));

drop policy if exists season_records_write on public.season_records;
create policy season_records_write on public.season_records
  for all using (public.is_editor(workspace_id)) with check (public.is_editor(workspace_id));
