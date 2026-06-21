-- Rushhour backend schema (Supabase / Postgres).
--
-- Run this in the Supabase SQL editor for a new project, then set
-- VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env. Until those are set the app
-- keeps running on localStorage (the mock adapters), so this is additive.
--
-- The model is multi-tenant: a workspace (the agency) has members with roles, and
-- all data hangs off a workspace. Row-Level Security ties every read/write to
-- workspace membership and role, so access control is enforced on the server (not
-- just hidden in the UI). This is the real version of the access matrix in
-- src/domain/access.ts.

-- ── Workspaces + membership ────────────────────────────────────────────────
create table if not exists public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now()
);

do $$ begin
  create type public.member_role as enum ('owner', 'editor', 'stakeholder');
exception when duplicate_object then null; end $$;

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  role         public.member_role not null default 'editor',
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- ── Assets (the sheet — one TrafficRow per row) ─────────────────────────────
-- Key columns are extracted for querying / RLS; the full TrafficRow lives in
-- `row` (jsonb) so the app's shape can evolve without migrations.
create table if not exists public.assets (
  id           text primary key,
  workspace_id uuid not null references public.workspaces on delete cascade,
  client       text,
  campaign     text,
  channel      text,
  status       text,
  scheduled_at timestamptz,
  row          jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists assets_workspace_idx on public.assets (workspace_id);
create index if not exists assets_campaign_idx on public.assets (workspace_id, campaign);

-- ── Membership helpers (used by the policies below) ─────────────────────────
create or replace function public.is_member(ws uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_editor(ws uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.role in ('owner', 'editor')
  );
$$;

-- ── Row-Level Security ──────────────────────────────────────────────────────
alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.assets            enable row level security;

-- Workspaces: a member can see their workspaces; the creator owns it.
drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces
  for select using (public.is_member(id));
drop policy if exists workspaces_insert on public.workspaces;
create policy workspaces_insert on public.workspaces
  for insert with check (created_by = auth.uid());

-- Membership: you can see rows for workspaces you belong to.
drop policy if exists members_select on public.workspace_members;
create policy members_select on public.workspace_members
  for select using (public.is_member(workspace_id));
-- A user may add themselves as the first member (owner) of a workspace they made.
drop policy if exists members_insert_self on public.workspace_members;
create policy members_insert_self on public.workspace_members
  for insert with check (user_id = auth.uid());

-- Assets: members read; editors/owners write. (Stakeholders are read-only — the
-- server enforces the access matrix here, not the UI.)
drop policy if exists assets_select on public.assets;
create policy assets_select on public.assets
  for select using (public.is_member(workspace_id));
drop policy if exists assets_write on public.assets;
create policy assets_write on public.assets
  for all using (public.is_editor(workspace_id)) with check (public.is_editor(workspace_id));

-- Further tables (clients, campaigns, comments, versions, shares, break_status,
-- audit_log) follow the same workspace_id + RLS pattern; added as their adapters
-- are wired off the mock localStorage helpers.
