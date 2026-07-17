-- Migration: add the `patterns` table (Records › Foundation › Patterns).
--
-- schema.sql now includes `patterns` in its record-table loop, so a fresh apply creates it. For an
-- EXISTING database (e.g. production), run this standalone migration once — it is idempotent
-- (create if not exists / drop policy if exists) and additive, and reuses the same is_member /
-- is_editor RLS helpers as every other record table (companies, message_records, voice_records, …).
--
-- Run it in the Supabase dashboard SQL editor (Project → SQL Editor → New query → paste → Run).

create table if not exists public.patterns (
  id           text primary key,
  workspace_id uuid not null references public.workspaces on delete cascade,
  name         text,
  data         jsonb not null,
  updated_at   timestamptz not null default now()
);

create index if not exists patterns_workspace_idx on public.patterns (workspace_id);

alter table public.patterns enable row level security;

drop policy if exists patterns_select on public.patterns;
create policy patterns_select on public.patterns
  for select using (public.is_member(workspace_id));

drop policy if exists patterns_write on public.patterns;
create policy patterns_write on public.patterns
  for all using (public.is_editor(workspace_id)) with check (public.is_editor(workspace_id));
