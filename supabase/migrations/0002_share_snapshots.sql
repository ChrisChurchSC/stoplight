-- Migration: add `share_snapshots` — public, read-only snapshots behind a ?share= link.
--
-- A share link carries a self-contained grant (client + role + id) in its token. To let a
-- recipient VIEW the brand's data with no account, the owner publishes a point-in-time,
-- brand-scoped snapshot here, keyed by the grant id. The snapshot holds only the shared
-- brand's slices (see src/lib/shareSnapshot.ts), never the owner's other clients.
--
-- Reads are deliberately NOT a blanket anon SELECT (that would let anyone with the public
-- anon key dump every snapshot). Instead a SECURITY DEFINER function returns exactly one
-- snapshot by id — the id lives in the link, so having the link is the access. Mirrors the
-- claim_invite RPC pattern. Writes are limited to editors of the owning workspace.
--
-- Idempotent + additive. Run once in an existing database via the Supabase dashboard SQL
-- editor (Project → SQL Editor → New query → paste → Run).

create table if not exists public.share_snapshots (
  id           text primary key,          -- the share grant id, from the ?share= token
  workspace_id uuid not null references public.workspaces on delete cascade,
  client       text not null,
  role         text not null,
  data         jsonb not null,            -- localStorage-shaped, scoped to `client`
  updated_at   timestamptz not null default now()
);

create index if not exists share_snapshots_workspace_idx on public.share_snapshots (workspace_id);

alter table public.share_snapshots enable row level security;

-- Owners/editors publish and manage their own workspace's snapshots (this also lets them
-- read their own back). Anonymous viewers get NO table-level select — only the RPC below.
drop policy if exists share_snapshots_write on public.share_snapshots;
create policy share_snapshots_write on public.share_snapshots
  for all using (public.is_editor(workspace_id)) with check (public.is_editor(workspace_id));

-- Single-row read by id, callable anonymously. SECURITY DEFINER bypasses RLS to return the
-- one snapshot named in the link; there is no way to enumerate the table through it.
create or replace function public.get_share_snapshot(share_id text)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select data from public.share_snapshots where id = share_id;
$$;

grant execute on function public.get_share_snapshot(text) to anon, authenticated;
