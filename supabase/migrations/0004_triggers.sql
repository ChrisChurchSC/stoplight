-- Migration: add the `triggers` table (Records › Go-to-market › Triggers).
--
-- schema.sql now includes `triggers` in its record-table loop, so a fresh apply creates it. For an
-- EXISTING database (e.g. production), run this standalone migration once — it is idempotent
-- (create if not exists / drop policy if exists) and additive, and reuses the same is_member /
-- is_editor RLS helpers as every other record table.
--
-- Run it in the Supabase dashboard SQL editor (Project → SQL Editor → New query → paste → Run).

create table if not exists public.triggers (
  id           text primary key,
  workspace_id uuid not null references public.workspaces on delete cascade,
  name         text,
  data         jsonb not null,
  updated_at   timestamptz not null default now()
);

create index if not exists triggers_workspace_idx on public.triggers (workspace_id);

alter table public.triggers enable row level security;

drop policy if exists triggers_select on public.triggers;
create policy triggers_select on public.triggers
  for select using (public.is_member(workspace_id));

drop policy if exists triggers_write on public.triggers;
create policy triggers_write on public.triggers
  for all using (public.is_editor(workspace_id)) with check (public.is_editor(workspace_id));
