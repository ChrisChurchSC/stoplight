-- Migration: add the `voice_records` table (Records › Foundation › Voices).
--
-- schema.sql now includes `voice_records` in its record-table loop, so a fresh apply creates it.
-- For an EXISTING database (e.g. production), run this standalone migration once — it is idempotent
-- (create if not exists / drop policy if exists) and additive, and reuses the same is_member /
-- is_editor RLS helpers as every other record table (companies, message_records, …).
--
-- Run it in the Supabase dashboard SQL editor (Project → SQL Editor → New query → paste → Run).

create table if not exists public.voice_records (
  id           text primary key,
  workspace_id uuid not null references public.workspaces on delete cascade,
  name         text,
  data         jsonb not null,
  updated_at   timestamptz not null default now()
);

create index if not exists voice_records_workspace_idx on public.voice_records (workspace_id);

alter table public.voice_records enable row level security;

drop policy if exists voice_records_select on public.voice_records;
create policy voice_records_select on public.voice_records
  for select using (public.is_member(workspace_id));

drop policy if exists voice_records_write on public.voice_records;
create policy voice_records_write on public.voice_records
  for all using (public.is_editor(workspace_id)) with check (public.is_editor(workspace_id));
