-- Migration: add the `concept_records` table (Records › Message › Concepts).
--
-- A Concept is the big idea a campaign is built on — the idea, the insight under it, and the
-- register it should be written in. It became a record kind when the Concept card stopped being
-- free text, and a card wired to the campaign now sends it to the copy writer.
--
-- schema.sql includes `concept_records` in its record-table loop, so a fresh apply creates it.
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

create table if not exists public.concept_records (
  id           text primary key,
  workspace_id uuid not null references public.workspaces on delete cascade,
  name         text,
  data         jsonb not null,
  updated_at   timestamptz not null default now()
);

create index if not exists concept_records_workspace_idx on public.concept_records (workspace_id);

alter table public.concept_records enable row level security;

drop policy if exists concept_records_select on public.concept_records;
create policy concept_records_select on public.concept_records
  for select using (public.is_member(workspace_id));

drop policy if exists concept_records_write on public.concept_records;
create policy concept_records_write on public.concept_records
  for all using (public.is_editor(workspace_id)) with check (public.is_editor(workspace_id));
