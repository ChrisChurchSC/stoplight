-- ── Close two functions that 0012 believed it had closed ───────────────────────────────────────
--
-- 0012 ended with `revoke all on function … from anon, authenticated`, which does nothing on its
-- own. Postgres grants EXECUTE on a new function to PUBLIC, and anon and authenticated inherit it
-- from there — so revoking from the roles by name leaves the PUBLIC grant they were reaching it
-- through, and both functions stayed callable with the anon key that ships in every browser bundle.
--
-- Verified against the live project after 0012 was applied: agent_token_row answered, and
-- agent_commands_prune returned 204 having actually run.
--
-- WHAT THAT EXPOSED, stated plainly rather than minimised:
--
--   agent_token_row is a validity oracle. It returns nulls for a token that does not match, so it
--   leaks nothing about tokens that exist, and a token is 256 bits of randomness — guessing one is
--   not a threat model. But anyone holding a valid token could already enqueue with it, so the
--   function offered nothing it should be answering to an unauthenticated caller.
--
--   agent_commands_prune is worse in kind, if not in degree: an unauthenticated DELETE. It only
--   removes commands already past their windows (answered over an hour ago, pending over ten
--   minutes), so it cannot touch a command in flight and cannot reach any other table. What it
--   could do is clear the audit trail of what the connector had recently done.
--
-- The fix is to revoke from PUBLIC, which is the grant that actually exists, and then hand back
-- EXECUTE only on the two functions that ARE the API and authenticate themselves from their first
-- argument.

revoke all on function public.agent_token_row(text) from public, anon, authenticated;
revoke all on function public.agent_commands_prune() from public, anon, authenticated;
revoke all on function public.agent_enqueue(text, text, jsonb) from public;
revoke all on function public.agent_result(text, uuid) from public;

grant execute on function public.agent_enqueue(text, text, jsonb) to anon, authenticated;
grant execute on function public.agent_result(text, uuid) to anon, authenticated;
