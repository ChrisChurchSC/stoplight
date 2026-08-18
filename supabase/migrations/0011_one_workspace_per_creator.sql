-- One workspace per creator, enforced by the database.
--
-- First sign-in could mint several workspaces for one account, milliseconds apart. It happened to
-- five of seven accounts on this project; one of them ended up with 1 898 assets in the workspace
-- the app opened and 1 817 in one it did not, invisible for a month.
--
-- Every guard against it lived in application code and every one of them is check-then-act:
-- resolveWorkspaceId() looks for an existing workspace, finds none, and inserts. Concurrent
-- sessions all pass the check before any of them commits, so all of them insert. The in-module
-- `resolving` promise dedupes calls within one tab and cannot see a second tab, a second device,
-- or a reload mid-flight. No amount of further application code wins this race; only a constraint
-- the database evaluates at write time does.
--
-- Partial, because created_by is nullable (auth.users on delete set null): a deleted account
-- leaves its workspaces behind with a null creator, and any number of those may coexist.
--
-- NOTE: this fails if an account currently has more than one workspace. That is deliberate — it is
-- a broken invariant, and silently tolerating it is what got us here. De-duplicate first:
--   select created_by, count(*) from public.workspaces
--    where created_by is not null group by created_by having count(*) > 1;

create unique index if not exists workspaces_one_per_creator
    on public.workspaces (created_by)
 where created_by is not null;
