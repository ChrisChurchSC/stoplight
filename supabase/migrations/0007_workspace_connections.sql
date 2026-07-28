-- Migration: workspace_connections — the multi-tenant connector store.
--
-- Each workspace connects its OWN accounts (Google, Resend, ...). Their tokens/keys live in
-- `credentials` (server-only: reachable ONLY by the service role, never by a browser). Clients read
-- non-secret connection STATUS through the connection_status() RPC. Run once in the SQL editor.

create table if not exists public.workspace_connections (
  workspace_id uuid not null references public.workspaces on delete cascade,
  provider     text not null,                        -- 'google' | 'resend' | 'buffer' | ...
  status       text not null default 'connected',    -- 'connected' | 'error' | 'revoked'
  credentials  jsonb,                                 -- refresh tokens / api keys (SERVICE ROLE ONLY)
  config       jsonb not null default '{}'::jsonb,    -- non-secret: selected properties/sites/channels
  connected_by uuid,
  connected_at timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (workspace_id, provider)
);

alter table public.workspace_connections enable row level security;
-- Intentionally NO anon/authenticated policies: the base table (incl. credentials) is reachable only
-- by the service role (the server). Clients never touch credentials directly.

-- Members read non-secret connection status for their workspace (provider + status + config only).
create or replace function public.connection_status(ws uuid)
returns table(provider text, status text, config jsonb, connected_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select provider, status, config, connected_at
  from public.workspace_connections
  where workspace_id = ws and public.is_member(ws);
$$;

grant execute on function public.connection_status(uuid) to anon, authenticated;
