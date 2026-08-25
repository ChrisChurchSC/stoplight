-- Migration: add the `creative` storage bucket — where a card's finished artwork lives.
--
-- An output card already holds everything true of one post except the post itself: the copy, the
-- channel, the audience, the schedule. The artwork lived in a Drive folder or a Slack thread, so
-- somebody had to hold the join in their head. Uploading it onto the card closes that, and the file
-- has to go somewhere that is not a jsonb column — a 40MB cut of a Reel is not workspace state.
--
-- The METADATA (name, size, dimensions, carousel order) rides the workspace_state mirror with every
-- other synced slice, under `stoplight.cardMedia.v1`. Only the bytes are here. See
-- src/domain/cardMedia.ts and src/adapters/media/creativeStore.ts.
--
-- PRIVATE, and reads are signed. A public bucket is simpler and wrong: these are unreleased campaign
-- assets, and a public object URL outlives the campaign, the client relationship, and anyone's
-- memory of having uploaded it. The policies below scope every read and write to workspace
-- membership, which is where the rest of this schema already puts that decision.
--
-- PATH SHAPE: `<workspace_id>/<row_id>/<media_id>.<ext>`. The workspace is the FIRST segment
-- because that is what these policies read. Anything else in the path is for humans browsing the
-- bucket in the dashboard.
--
-- Idempotent + additive. Run once in an existing database via the Supabase dashboard SQL editor
-- (Project → SQL Editor → New query → paste → Run).

-- ── The bucket ──────────────────────────────────────────────────────────────
-- `public => false`: every read goes through a signed URL, which is what makes the policies below
-- the only way in. file_size_limit is per object; note the PROJECT's global upload limit still
-- applies and is lower by default on some plans (Settings → Storage), so raise that too if a
-- 200MB video needs to land.
insert into storage.buckets (id, name, public, file_size_limit)
values ('creative', 'creative', false, 209715200)
on conflict (id) do nothing;

-- ── Which workspace an object belongs to ────────────────────────────────────
-- The first path segment, as a uuid. A guarded cast rather than a bare one: a policy that raises
-- on a malformed path does not deny that one object, it makes the whole storage API error for
-- everybody. Anything that is not a uuid answers NULL, and NULL fails is_member/is_editor, so a
-- junk path is simply unreachable.
create or replace function public.creative_workspace(object_name text)
returns uuid language plpgsql immutable as $$
begin
  return (storage.foldername(object_name))[1]::uuid;
exception when others then
  return null;
end;
$$;

-- ── Row-Level Security on the objects themselves ────────────────────────────
-- storage.objects already has RLS enabled by Supabase; these add the bucket's own rules.
--
-- Members READ (a stakeholder reviewing a campaign needs to open the artwork), editors WRITE — the
-- same split as every other table here, via the same two helpers, so access is defined in one place
-- and a role change takes effect everywhere at once.

drop policy if exists creative_select on storage.objects;
create policy creative_select on storage.objects
  for select using (
    bucket_id = 'creative'
    and public.is_member(public.creative_workspace(name))
  );

drop policy if exists creative_insert on storage.objects;
create policy creative_insert on storage.objects
  for insert with check (
    bucket_id = 'creative'
    and public.is_editor(public.creative_workspace(name))
  );

-- UPDATE is what an upsert lands on when the object already exists. The media id makes each path
-- unique, so that can only be a retry of the same file by the same card — the one case where
-- overwriting is right. USING and WITH CHECK both, or an editor could move an object out of their
-- own workspace's prefix and into someone else's.
drop policy if exists creative_update on storage.objects;
create policy creative_update on storage.objects
  for update
  using (
    bucket_id = 'creative'
    and public.is_editor(public.creative_workspace(name))
  )
  with check (
    bucket_id = 'creative'
    and public.is_editor(public.creative_workspace(name))
  );

drop policy if exists creative_delete on storage.objects;
create policy creative_delete on storage.objects
  for delete using (
    bucket_id = 'creative'
    and public.is_editor(public.creative_workspace(name))
  );
