import { supabase } from './supabase'
import { getActiveWorkspaceId, getSession } from './session'

/**
 * THE CREDENTIAL CLAUDE DESKTOP CONNECTS WITH.
 *
 * A token is minted HERE, in the browser, and the plaintext is never sent to the server: only its
 * SHA-256 goes into the table. So a dump of `agent_tokens` cannot be used to connect, and nobody —
 * including whoever can read the database — can recover a token after the one time it is shown.
 *
 * That is also why there is no "show it again". Losing one costs a revoke and a re-mint, which is
 * the correct price; the alternative is a table of live credentials in plaintext, readable forever.
 *
 * Revoking is a timestamp rather than a delete, so a token that did something is still there to be
 * accounted for afterwards. `agent_token_row` only ever matches one with `revoked_at is null`, so
 * stamping it is what actually cuts the connection.
 */

/** Prefix on every token, so one is recognisable on sight in a config file or a support thread. */
const PREFIX = 'bc_'

export interface AgentToken {
  id: string
  label: string | null
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

/** 32 random bytes, base64url — 256 bits, and safe to paste into JSON or a shell. */
function mintPlaintext(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** The same digest the database checks against: sha256 of the plaintext, lowercase hex. */
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const rowToToken = (r: Record<string, unknown>): AgentToken => ({
  id: String(r.id),
  label: (r.label as string | null) ?? null,
  createdAt: String(r.created_at),
  lastUsedAt: (r.last_used_at as string | null) ?? null,
  revokedAt: (r.revoked_at as string | null) ?? null,
})

/**
 * Mint a token for this workspace and return the plaintext ONCE.
 *
 * The caller has to show it immediately; there is no way to read it back, here or anywhere.
 */
export async function createAgentToken(label: string): Promise<{ token: string; row: AgentToken } | { error: string }> {
  if (!supabase) return { error: 'Not connected to a workspace.' }
  const ws = await getActiveWorkspaceId()
  if (!ws) return { error: 'No workspace is signed in.' }
  const session = await getSession()
  const userId = session?.user?.id
  if (!userId) return { error: 'No workspace is signed in.' }

  const token = mintPlaintext()
  const { data, error } = await supabase
    .from('agent_tokens')
    .insert({ workspace_id: ws, user_id: userId, token_hash: await sha256Hex(token), label: label.trim() || null })
    .select('id, label, created_at, last_used_at, revoked_at')
  // The error is READ, not discarded: postgrest resolves with { error } rather than rejecting, so
  // an RLS denial would otherwise hand back a token that connects to nothing.
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'The token was not saved.' }
  return { token, row: rowToToken(data[0]) }
}

/** Every token on this workspace, newest first. Never includes a plaintext — there is none stored. */
export async function listAgentTokens(): Promise<AgentToken[]> {
  if (!supabase) return []
  const ws = await getActiveWorkspaceId()
  if (!ws) return []
  const { data, error } = await supabase
    .from('agent_tokens')
    .select('id, label, created_at, last_used_at, revoked_at')
    .eq('workspace_id', ws)
    .order('created_at', { ascending: false })
  if (error) return []
  return (data ?? []).map(rowToToken)
}

/** Cut a token off. Takes effect on its next call — the database checks revoked_at every time. */
export async function revokeAgentToken(id: string): Promise<string | null> {
  if (!supabase) return 'Not connected to a workspace.'
  const { error } = await supabase
    .from('agent_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
  return error?.message ?? null
}
