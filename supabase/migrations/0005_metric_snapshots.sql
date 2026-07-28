-- Migration: add `metric_snapshots` — the append-only metrics time-series.
--
-- Every metrics sync APPENDS rows here instead of overwriting, so the app keeps history (trends)
-- not just the latest value. `campaign` + `audience` are denormalized onto asset snapshots so
-- "which journey worked for which persona over time" is a direct query. Append-only by policy:
-- members read, editors insert, no update/delete (points are immutable).
--
-- schema.sql includes this table for fresh applies. For an EXISTING database (e.g. production), run
-- this standalone migration once — idempotent + additive. Run it in the Supabase dashboard SQL
-- editor (Project → SQL Editor → New query → paste → Run).

create table if not exists public.metric_snapshots (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  brand        text not null,
  scope        text not null,          -- 'brand' | 'channel' | 'campaign' | 'asset'
  scope_id     text not null,          -- channel id / campaign name / asset id / brand
  campaign     text,                   -- denormalized (asset snapshots) for per-persona queries
  audience     text,                   -- the persona
  metric       text not null,          -- reach | engagement | clicks | conversions | revenue | …
  value        double precision not null,
  unit         text,
  source       text,                   -- ga4 | linkedin | summer | mock | reconcile …
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
