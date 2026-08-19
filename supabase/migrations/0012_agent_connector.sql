-- ── The Claude Desktop connector, against the deployed app ──────────────────────────────────────
--
-- The connector used to reach the app through a Vite dev-server plugin: an SSE hub holding open
-- streams to browser tabs, with the pending commands in module scope. That is dev-only by
-- construction — the hub is stateful, and a serverless function gets a fresh instance per
-- invocation, so the tab's stream and the command awaiting its reply would land in different ones.
--
-- So the queue moves into the database, which is the one thing both ends can already reach. The MCP
-- server enqueues; the open tab (still the executor — the app's real logic lives in its store) picks
-- the row up, runs it, and writes the answer back.
--
-- WHY RPCs RATHER THAN PLAIN TABLE ACCESS. The MCP server holds an opaque token, not a Supabase
-- session, so auth.uid() is null for it and no RLS policy can recognise it. The two functions below
-- are security definer and take the token as an argument: they verify it themselves, resolve the
-- workspace FROM the token rather than from anything the caller asserts, and are the only way in.
-- The browser side needs none of this — it is a signed-in member and goes through RLS as usual.

create extension if not exists pgcrypto;

-- ── Tokens ─────────────────────────────────────────────────────────────────────────────────────
-- One revocable credential per connected client. The plaintext is generated in the browser, shown
-- once, and never sent here: only its SHA-256 is stored, so a dump of this table cannot be used to
-- connect. Revoking is a timestamp rather than a delete, so a token that did something can still be
-- accounted for afterwards.
create table if not exists public.agent_tokens (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  user_id      uuid not null references auth.users on delete cascade,
  token_hash   text not null unique,
  label        text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
create index if not exists agent_tokens_workspace_idx on public.agent_tokens (workspace_id);

alter table public.agent_tokens enable row level security;
-- Members see their workspace's tokens (to list and revoke them); only the owner creates one, and
-- only for themselves, so one member cannot mint a credential that acts as another.
drop policy if exists agent_tokens_select on public.agent_tokens;
create policy agent_tokens_select on public.agent_tokens
  for select using (public.is_member(workspace_id));
drop policy if exists agent_tokens_insert on public.agent_tokens;
create policy agent_tokens_insert on public.agent_tokens
  for insert with check (public.is_member(workspace_id) and user_id = auth.uid());
drop policy if exists agent_tokens_update on public.agent_tokens;
create policy agent_tokens_update on public.agent_tokens
  for update using (public.is_member(workspace_id)) with check (public.is_member(workspace_id));
drop policy if exists agent_tokens_delete on public.agent_tokens;
create policy agent_tokens_delete on public.agent_tokens
  for delete using (public.is_member(workspace_id));

-- ── The queue ──────────────────────────────────────────────────────────────────────────────────
-- One row per command. `status` is the whole protocol: pending until a tab claims it, then done or
-- error with the answer beside it.
create table if not exists public.agent_commands (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  token_id     uuid references public.agent_tokens on delete set null,
  action       text not null,
  args         jsonb not null default '{}'::jsonb,
  status       text not null default 'pending' check (status in ('pending', 'done', 'error')),
  result       jsonb,
  error        text,
  created_at   timestamptz not null default now(),
  claimed_at   timestamptz,
  completed_at timestamptz
);
-- The executor's only query: this workspace's pending commands, oldest first.
create index if not exists agent_commands_pending_idx
  on public.agent_commands (workspace_id, created_at)
  where status = 'pending';

alter table public.agent_commands enable row level security;
-- Only the browser side touches this table directly, and only for its own workspace. The MCP server
-- never does: it has no session, and goes through the definer functions below.
drop policy if exists agent_commands_select on public.agent_commands;
create policy agent_commands_select on public.agent_commands
  for select using (public.is_member(workspace_id));
drop policy if exists agent_commands_update on public.agent_commands;
create policy agent_commands_update on public.agent_commands
  for update using (public.is_editor(workspace_id)) with check (public.is_editor(workspace_id));
-- No insert policy on purpose. A command may only be created by agent_enqueue, which is what ties
-- every row to a verified token.

-- ── Token verification ─────────────────────────────────────────────────────────────────────────
-- Resolves a plaintext token to its row, or nothing. Not exposed to the API (revoked from anon and
-- authenticated below): it exists so the two entry points share one definition of "valid".
create or replace function public.agent_token_row(p_token text)
returns public.agent_tokens
language sql
security definer
stable
set search_path = public, extensions
as $$
  select t.* from public.agent_tokens t
  where t.token_hash = encode(digest(p_token, 'sha256'), 'hex')
    and t.revoked_at is null
  limit 1;
$$;

-- ── Enqueue ────────────────────────────────────────────────────────────────────────────────────
-- The MCP server's way in. The workspace comes from the TOKEN, never from an argument, so a caller
-- cannot aim a command at a workspace its token does not belong to.
create or replace function public.agent_enqueue(p_token text, p_action text, p_args jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok public.agent_tokens;
  new_id uuid;
begin
  tok := public.agent_token_row(p_token);
  if tok.id is null then
    raise exception 'invalid or revoked token' using errcode = '28000';
  end if;
  if p_action is null or length(trim(p_action)) = 0 then
    raise exception 'action is required' using errcode = '22023';
  end if;

  insert into public.agent_commands (workspace_id, token_id, action, args)
  values (tok.workspace_id, tok.id, p_action, coalesce(p_args, '{}'::jsonb))
  returning id into new_id;

  update public.agent_tokens set last_used_at = now() where id = tok.id;
  return new_id;
end;
$$;

-- ── Read the answer ────────────────────────────────────────────────────────────────────────────
-- Scoped to the token's own workspace, so a token cannot read a command it did not cause.
create or replace function public.agent_result(p_token text, p_id uuid)
returns table (status text, result jsonb, error text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  tok public.agent_tokens;
begin
  tok := public.agent_token_row(p_token);
  if tok.id is null then
    raise exception 'invalid or revoked token' using errcode = '28000';
  end if;

  return query
    select c.status, c.result, c.error
    from public.agent_commands c
    where c.id = p_id and c.workspace_id = tok.workspace_id;
end;
$$;

-- The verifier is internal. Leaving it callable would let anyone with the anon key read a token row
-- (including its hash and workspace) by guessing, which is exactly what the hashing is for.
revoke all on function public.agent_token_row(text) from anon, authenticated;
-- The two entry points ARE the API, and they authenticate themselves from their first argument.
grant execute on function public.agent_enqueue(text, text, jsonb) to anon, authenticated;
grant execute on function public.agent_result(text, uuid) to anon, authenticated;

-- Housekeeping: a queue nobody trims grows forever, and a stale pending row is a command that will
-- never run. Answered rows are worth an hour for debugging; anything older is noise.
create or replace function public.agent_commands_prune()
returns void language sql security definer set search_path = public as $$
  delete from public.agent_commands
  where (status <> 'pending' and completed_at < now() - interval '1 hour')
     or (status = 'pending' and created_at < now() - interval '10 minutes');
$$;
