-- Migration: add `get_share_snapshot_owner` — which workspace published a share snapshot.
--
-- A ?share= link serves its published snapshot to anyone who cannot already read the work
-- another way. Deciding that needs one fact the client cannot get: the workspace that owns
-- the snapshot. share_snapshots itself is not readable by a recipient (its RLS admits only
-- editors of the owning workspace), and get_share_snapshot returns the data alone.
--
-- Without this, the client had to fall back on "is this viewer signed in?", which is wrong
-- for exactly the person a share link is most often sent to: someone who follows the link
-- and then makes an account. They end up signed into a new, empty workspace of their own and
-- the snapshot is never fetched, so the page renders blank. See src/domain/shareAccess.ts.
--
-- Returning the id is not a leak: it is an opaque uuid, RLS still governs every table keyed
-- by it, and the caller already holds the link the id belongs to. Same SECURITY DEFINER
-- single-row-by-id shape as get_share_snapshot and claim_invite.
--
-- Idempotent + additive. Run once in an existing database via the Supabase dashboard SQL
-- editor (Project → SQL Editor → New query → paste → Run).

create or replace function public.get_share_snapshot_owner(share_id text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select workspace_id from public.share_snapshots where id = share_id;
$$;

grant execute on function public.get_share_snapshot_owner(text) to anon, authenticated;
