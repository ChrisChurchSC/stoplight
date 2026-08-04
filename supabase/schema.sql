-- Breadcrumbs backend schema (Supabase / Postgres).
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

-- Workspaces: a member can see their workspaces; the creator can also see it (needed so the
-- INSERT ... RETURNING on first sign-in isn't blocked by RLS before membership exists).
drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces
  for select using (public.is_member(id) or created_by = auth.uid());
drop policy if exists workspaces_insert on public.workspaces;
create policy workspaces_insert on public.workspaces
  for insert with check (created_by = auth.uid());

-- Membership: you can see rows for workspaces you belong to.
drop policy if exists members_select on public.workspace_members;
create policy members_select on public.workspace_members
  for select using (public.is_member(workspace_id));
-- A user may add themselves ONLY to a workspace they created (first sign-in). Joining any other
-- workspace goes through the claim_invite() function (security definer), so a signed-in user can't
-- self-join an arbitrary workspace by guessing its id.
drop policy if exists members_insert_self on public.workspace_members;
create policy members_insert_self on public.workspace_members
  for insert with check (
    user_id = auth.uid()
    and workspace_id in (select id from public.workspaces where created_by = auth.uid())
  );

-- ── Invites (share a workspace by link) ─────────────────────────────────────
-- A token an owner/editor generates; a signed-in user redeems it via claim_invite() to join the
-- workspace. No service_role key needed — the redemption runs as a security-definer function.
create table if not exists public.workspace_invites (
  token        text primary key,
  workspace_id uuid not null references public.workspaces on delete cascade,
  role         public.member_role not null default 'editor',
  created_by   uuid references auth.users on delete set null,
  created_at   timestamptz not null default now(),
  claimed_by   uuid references auth.users on delete set null,
  claimed_at   timestamptz
);
alter table public.workspace_invites enable row level security;
-- Owners/editors of the workspace can create + see its invites.
drop policy if exists invites_manage on public.workspace_invites;
create policy invites_manage on public.workspace_invites
  for all using (public.is_editor(workspace_id)) with check (public.is_editor(workspace_id));

-- Redeem an invite: add the caller to the workspace as the invited role. Returns the workspace id.
create or replace function public.claim_invite(invite_token text)
returns uuid language plpgsql security definer as $$
declare inv public.workspace_invites;
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into inv from public.workspace_invites where token = invite_token;
  if inv.token is null then raise exception 'invalid invite'; end if;
  if inv.claimed_by is not null and inv.claimed_by <> uid then raise exception 'invite already used'; end if;
  insert into public.workspace_members (workspace_id, user_id, role)
    values (inv.workspace_id, uid, inv.role)
    on conflict (workspace_id, user_id) do nothing;
  update public.workspace_invites set claimed_by = uid, claimed_at = now() where token = invite_token;
  return inv.workspace_id;
end $$;

-- Assets: members read; editors/owners write. (Stakeholders are read-only — the
-- server enforces the access matrix here, not the UI.)
drop policy if exists assets_select on public.assets;
create policy assets_select on public.assets
  for select using (public.is_member(workspace_id));
drop policy if exists assets_write on public.assets;
create policy assets_write on public.assets
  for all using (public.is_editor(workspace_id)) with check (public.is_editor(workspace_id));

-- ── Messages (all inbound engagement ingested from every channel) ───────────
-- One row per inbound message (comment / reply / mention) pulled back from a
-- channel, linked to the asset it's on. This is the durable, shared store for
-- everything that comes BACK from the channels (the inbound counterpart to the
-- outbound copy in `assets`), and the "memory" the performance loop reads from.
create table if not exists public.messages (
  id             text primary key,
  workspace_id   uuid not null references public.workspaces on delete cascade,
  asset_id       text not null,
  campaign       text,
  platform       text,
  author         text,
  text           text,
  ts             bigint,
  likes          int,
  replies        int,
  sentiment      text,
  needs_response boolean,
  intent         boolean,
  clay_routed    boolean default false,
  enrichment     jsonb,
  routed         boolean default false,
  created_at     timestamptz not null default now()
);
create index if not exists messages_workspace_idx on public.messages (workspace_id);
create index if not exists messages_asset_idx on public.messages (asset_id);

alter table public.messages enable row level security;
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select using (public.is_member(workspace_id));
drop policy if exists messages_write on public.messages;
create policy messages_write on public.messages
  for all using (public.is_editor(workspace_id)) with check (public.is_editor(workspace_id));

-- ── Record lists (Records › … sheets) ──────────────────────────────────────
-- One table per record type, all the same shape as assets: (id, workspace_id,
-- name, data jsonb) with the full record in `data`. Created in a loop so they
-- stay identical; each gets member-read / editor-write RLS. Backed by
-- SupabaseRecordAdapter (src/adapters/records). `message_records` is the
-- Records › Messages sheet — distinct from the inbound `messages` table above.
do $$
declare t text;
begin
  foreach t in array array[
    'brands', 'companies', 'people', 'segments', 'channels',
    'objectives', 'message_records', 'voice_records', 'patterns', 'triggers', 'tasks', 'proof_points',
    'concept_records', 'season_records', 'products', 'brand_objects', 'library_folders'
  ] loop
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

-- ── Workspace state (per-brand maps + singletons that aren't record lists) ──
-- Brand systems / profiles / audiences, the client list, campaign metadata,
-- reports, media mixes, saved chats, etc. are keyed maps or single objects, not
-- entity lists, so they live as one jsonb value per localStorage key (the same
-- keys the app already uses). Backed by src/adapters/state.
create table if not exists public.workspace_state (
  workspace_id uuid not null references public.workspaces on delete cascade,
  key          text not null,
  value        jsonb not null,
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, key)
);
alter table public.workspace_state enable row level security;
drop policy if exists workspace_state_select on public.workspace_state;
create policy workspace_state_select on public.workspace_state
  for select using (public.is_member(workspace_id));
drop policy if exists workspace_state_write on public.workspace_state;
create policy workspace_state_write on public.workspace_state
  for all using (public.is_editor(workspace_id)) with check (public.is_editor(workspace_id));

-- ── Metric snapshots (append-only metrics time-series) ──
-- Every metrics sync appends here (never overwrites), keeping history for trend + per-persona
-- learning. Append-only by policy: members read, editors insert, no update/delete. See
-- supabase/migrations/0005_metric_snapshots.sql.
create table if not exists public.metric_snapshots (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  brand        text not null,
  scope        text not null,
  scope_id     text not null,
  campaign     text,
  audience     text,
  metric       text not null,
  value        double precision not null,
  unit         text,
  source       text,
  captured_at  timestamptz not null default now()
);
create index if not exists metric_snapshots_ws_brand_idx on public.metric_snapshots (workspace_id, brand, captured_at desc);
create index if not exists metric_snapshots_scope_idx on public.metric_snapshots (workspace_id, scope, scope_id);
create index if not exists metric_snapshots_audience_idx on public.metric_snapshots (workspace_id, brand, audience);
alter table public.metric_snapshots enable row level security;
drop policy if exists metric_snapshots_select on public.metric_snapshots;
create policy metric_snapshots_select on public.metric_snapshots
  for select using (public.is_member(workspace_id));
drop policy if exists metric_snapshots_insert on public.metric_snapshots;
create policy metric_snapshots_insert on public.metric_snapshots
  for insert with check (public.is_editor(workspace_id));

-- ── Aggregate outcomes (anonymized cross-customer learning pool) ──
-- Workspaces contribute anonymized (dimension × archetype × attribute → outcome) rows keyed by an
-- opaque contributor hash; reads are floor-gated + aggregated via aggregate_patterns() only (no
-- direct select). See supabase/migrations/0006_aggregate_outcomes.sql.
create table if not exists public.aggregate_outcomes (
  contributor  text not null,
  dimension    text not null,
  archetype    text not null,
  attribute    text not null,
  variants     integer not null default 0,
  outcome      double precision not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (contributor, dimension, archetype, attribute)
);
alter table public.aggregate_outcomes enable row level security;
drop policy if exists aggregate_outcomes_insert on public.aggregate_outcomes;
create policy aggregate_outcomes_insert on public.aggregate_outcomes
  for insert with check (auth.role() = 'authenticated');
drop policy if exists aggregate_outcomes_update on public.aggregate_outcomes;
create policy aggregate_outcomes_update on public.aggregate_outcomes
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create or replace function public.aggregate_patterns(min_customers int default 10)
returns table(dimension text, archetype text, attribute text, customers bigint, variants bigint, outcome double precision)
language sql security definer set search_path = public as $$
  select dimension, archetype, attribute, count(distinct contributor) as customers,
         sum(variants) as variants, sum(outcome) as outcome
  from public.aggregate_outcomes
  group by dimension, archetype, attribute
  having count(distinct contributor) >= greatest(min_customers, 1);
$$;
grant execute on function public.aggregate_patterns(int) to anon, authenticated;

-- ── Share snapshots (public, read-only brand snapshots behind a ?share= link) ──
-- The owner publishes a point-in-time, brand-scoped snapshot keyed by the grant id
-- so a recipient can VIEW with no account. Reads go through a SECURITY DEFINER RPC
-- (one row by id — the id is in the link), never a blanket anon select. See
-- supabase/migrations/0002_share_snapshots.sql for the rationale.
create table if not exists public.share_snapshots (
  id           text primary key,
  workspace_id uuid not null references public.workspaces on delete cascade,
  client       text not null,
  role         text not null,
  data         jsonb not null,
  updated_at   timestamptz not null default now()
);
create index if not exists share_snapshots_workspace_idx on public.share_snapshots (workspace_id);
alter table public.share_snapshots enable row level security;
drop policy if exists share_snapshots_write on public.share_snapshots;
create policy share_snapshots_write on public.share_snapshots
  for all using (public.is_editor(workspace_id)) with check (public.is_editor(workspace_id));
create or replace function public.get_share_snapshot(share_id text)
returns jsonb language sql security definer set search_path = public as $$
  select data from public.share_snapshots where id = share_id;
$$;
grant execute on function public.get_share_snapshot(text) to anon, authenticated;

-- ── Audit log + campaign version history (append-only) ─────────────────────
-- The disclosure trail and the copy save-points. Both are pure appends in the app, and neither
-- grants update: a trail entry a client can rewrite is not a trail entry, and a save point you can
-- rewrite is not a save point. audit_log grants no delete either. campaign_versions does, because
-- deleting a brand purges its history with it (see brandPurgePatch) — without that the purge would
-- succeed locally and a fresh device would hydrate the deleted brand's versions back.
-- Key columns are extracted for querying; the full record stays in `data`. See migrations/0010.
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

-- Still local (UI/ephemeral): saved views, pinned insights, open projects,
-- active canvas, break status, onboarding — fine to leave per-browser for now.
--
-- Also still local, and NOT because anyone decided so — these predate the backend and were simply
-- never wired: brand actuals, drive links, brand datasets, conditions, coherence decisions,
-- artboards, canvas card positions, campaign RTBs, accounts / target lists / campaign target,
-- share grants, ai model choice. Listed here so the gap is visible rather than inferred from a
-- grep for localStorage.setItem.
